import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { status } from "elysia";
import { env } from "./env";

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Anon client: verifies access tokens and calls the three functions anon may run. No table access. */
export const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, noSession);

/**
 * Per-request client that carries the caller's JWT, so Postgres RLS and the SQL functions' own checks
 * apply to every call. All business data goes through this. (playbook: 02 - Auth and Roles, "Three clients")
 */
export function userClient(token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
export type Db = ReturnType<typeof userClient>;

/** Service-role client for Auth admin calls only: create a sign-up link, set pending metadata, make the first super admin. */
export function serviceClient() {
  if (!env.SUPABASE_SECRET_KEY) throw status(503, { error: "Sign-up is not set up yet." });
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, noSession);
}

/**
 * Unwraps a Supabase result or throws a safe HTTP error. Text we raise ourselves (P0001) is written for
 * users and passes through. Everything else becomes a fixed sentence, so table, column and constraint
 * names never reach the client. (playbook: 01 - Security Baseline, "Errors")
 */
export function must<T>(result: { data: unknown; error: PostgrestError | null }): T {
  const { data, error } = result;
  if (!error) return data as T;
  switch (error.code) {
    case "P0001":
      throw status(400, { error: error.message });
    case "GS404":
      throw status(404, { error: error.message });
    case "PGRST116":
      throw status(404, { error: "Not found." });
    case "23505":
      throw status(409, { error: "That already exists." });
    case "23503":
      throw status(400, { error: "Something this refers to no longer exists. Refresh and try again." });
    case "23502":
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
    case "22001":
      throw status(400, { error: "Some values are missing or not allowed." });
    case "42501":
      if (error.message === "mfa_required") throw status(403, { error: "Enter your authenticator code to continue.", code: "mfa_required" });
      if (error.message === "site_suspended") throw status(403, { error: "This site is suspended. Contact the platform team.", code: "site_suspended" });
      throw status(403, { error: "You don't have access to that." });
    default:
      console.error("supabase error", error.code, error.message);
      throw status(500, { error: "Something went wrong. Try again." });
  }
}
