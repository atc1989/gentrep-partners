// Real migrations in PGlite (in-process Postgres) with small stubs for Supabase's auth and storage schemas.
// No Docker, no Supabase project, never a network call. Used by db.test.ts and the fake Supabase server.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Claims = { sub: string; aal?: "aal1" | "aal2" };

export async function openDb() {
  const dir = join(import.meta.dir, "..");
  const db = new PGlite();

  await db.exec(`
    create schema extensions; create schema auth; create schema storage;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    create table auth.users (
      id uuid primary key default gen_random_uuid(), email text unique, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now());
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    -- Supabase's default: everything granted. The migration must revoke it.
    grant all on all tables in schema public to anon, authenticated;
    grant all on all functions in schema public to anon, authenticated;
  `);

  for (const file of readdirSync(join(dir, "migrations")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, "migrations", file), "utf8"));
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }
  // storage.objects needs insert for the test role the way Supabase Storage's own role has it.
  await db.exec(`grant select, insert, delete on storage.objects to authenticated; grant select on storage.buckets to authenticated;`);
  return db;
}

export type Db = Awaited<ReturnType<typeof openDb>>;

/** Runs fn as a Supabase role with the given JWT claims, then puts the session back to superuser. */
export async function as<T>(db: Db, role: "anon" | "authenticated" | "service_role", claims: Claims | null, fn: () => Promise<T>): Promise<T> {
  const jwt = claims ? JSON.stringify({ sub: claims.sub, role, aal: claims.aal ?? "aal1" }) : "";
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [jwt]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [claims?.sub ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
