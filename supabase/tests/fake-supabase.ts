// TEST DOUBLE, not Supabase. A small HTTP server that answers the calls this project makes, backed by the real
// migrations in PGlite: PostgREST rpc, GoTrue (sign-in, verify link, admin, MFA/TOTP) and Storage (upload, public read).
// It exists so API tests and UI checks run without Docker. It proves our SQL and our code, not GoTrue itself:
// `bun run test:e2e` runs the same flows against a real dev project once one is linked.
import { openDb, as, type Db } from "./pglite";

const enc = new TextEncoder();
const b64u = (input: ArrayBuffer | string) =>
  Buffer.from(typeof input === "string" ? enc.encode(input) : new Uint8Array(input)).toString("base64url");
const rand = (n = 24) => b64u(crypto.getRandomValues(new Uint8Array(n)).buffer as ArrayBuffer).slice(0, n);

// ---- TOTP (RFC 6238), so tests and the dev seed can produce codes -----------------------------------------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const b32encode = (bytes: Uint8Array) => {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return (bits.match(/.{1,5}/g) ?? []).map((c) => B32[parseInt(c.padEnd(5, "0"), 2)]).join("");
};
const b32decode = (s: string) => {
  const bits = [...s].map((c) => B32.indexOf(c).toString(2).padStart(5, "0")).join("");
  return Uint8Array.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
};
export async function totp(secret: string, at = Date.now()) {
  const key = await crypto.subtle.importKey("raw", b32decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(at / 30_000)));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter.buffer));
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const FAKE_KEYS = { publishable: "fake-publishable-key", secret: "fake-secret-key" };

export type Fake = Awaited<ReturnType<typeof startFake>>;

export async function startFake(opts: { port?: number } = {}) {
  const db: Db = await openDb();
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "fake-1", alg: "ES256", use: "sig" };

  const passwords = new Map<string, string>(); // email -> password
  const linkTokens = new Map<string, { userId: string; type: string }>();
  const refreshTokens = new Map<string, { userId: string; aal: "aal1" | "aal2" }>();
  const factors = new Map<string, { id: string; userId: string; secret: string; verified: boolean }>();
  const challenges = new Map<string, string>();
  const objects = new Map<string, { bytes: ArrayBuffer; type: string }>();

  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };

  let origin = "";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const goTrueError = (status: number, error_code: string, msg: string) => json({ code: status, error_code, msg }, status);

  // ---- JWT -------------------------------------------------------------------------------------------------
  async function sign(payload: object) {
    const data = `${b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "fake-1" }))}.${b64u(JSON.stringify(payload))}`;
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, enc.encode(data));
    return `${data}.${b64u(sig)}`;
  }
  async function verifyJwt(token: string): Promise<{ sub: string; aal: "aal1" | "aal2" } | null> {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    try {
      const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, Buffer.from(s, "base64url"), enc.encode(`${h}.${p}`));
      if (!ok) return null;
      const claims = JSON.parse(Buffer.from(p, "base64url").toString());
      if (claims.exp < Date.now() / 1000) return null;
      return { sub: claims.sub, aal: claims.aal };
    } catch {
      return null;
    }
  }

  // ---- users and sessions ----------------------------------------------------------------------------------
  const userRow = async (id: string) => (await db.query(`select * from auth.users where id = $1`, [id])).rows[0] as any;
  const userByEmail = async (email: string) => (await db.query(`select * from auth.users where email = $1`, [email])).rows[0] as any;
  const userJson = (u: any) => ({
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.email_confirmed_at,
    app_metadata: { provider: "email", providers: ["email"], ...(u.raw_app_meta_data ?? {}) }, user_metadata: u.raw_user_meta_data ?? {},
    factors: [...factors.values()].filter((f) => f.userId === u.id).map((f) => ({ id: f.id, factor_type: "totp", status: f.verified ? "verified" : "unverified", friendly_name: "Authenticator" })),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  async function session(userId: string, aal: "aal1" | "aal2" = "aal1") {
    const u = await userRow(userId);
    const now = Math.floor(Date.now() / 1000);
    const access_token = await sign({
      iss: `${origin}/auth/v1`, aud: "authenticated", sub: u.id, role: "authenticated", email: u.email, aal, iat: now, exp: now + 3600,
      amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: now }], session_id: crypto.randomUUID(),
      app_metadata: { provider: "email", ...(u.raw_app_meta_data ?? {}) }, user_metadata: {},
    });
    const refresh_token = rand(16);
    refreshTokens.set(refresh_token, { userId, aal });
    return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(u) };
  }
  const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  async function caller(req: Request) {
    const token = bearer(req);
    if (token === FAKE_KEYS.secret || (!token && req.headers.get("apikey") === FAKE_KEYS.secret)) return { role: "service_role" as const, claims: null };
    if (!token || token === FAKE_KEYS.publishable) return { role: "anon" as const, claims: null };
    const claims = await verifyJwt(token);
    return claims ? { role: "authenticated" as const, claims } : null;
  }

  // ---- PostgREST rpc ---------------------------------------------------------------------------------------
  async function rpc(fn: string, body: Record<string, unknown>, who: NonNullable<Awaited<ReturnType<typeof caller>>>) {
    const [meta] = (await db.query(`select p.prorettype::regtype::text as ret from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn])).rows as any[];
    if (!meta) return json({ code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null }, 404);
    const sig = (await db.query(
      `select a.name, format_type(a.typ, null) as type from pg_proc p cross join lateral unnest(p.proargnames, p.proargtypes::oid[]) as a(name, typ)
       where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn])).rows as { name: string; type: string }[];
    const used = sig.filter((a) => a.name in body);
    const params = used.map((a) => (a.type === "jsonb" || a.type === "json" ? JSON.stringify(body[a.name]) : body[a.name]));
    const args = used.map((a, i) => `${a.name} := $${i + 1}::${a.type}`).join(", ");
    const call = `public.${fn}(${args})`;
    try {
      const rows = await serial(() =>
        as(db, who.role, who.claims, async () => (await db.query(meta.ret === "void" ? `select ${call}` : `select to_jsonb(${call}) as v`, params)).rows as any[]),
      );
      return meta.ret === "void" ? new Response(null, { status: 204 }) : json(rows[0]?.v ?? null);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const status = err.code === "42501" ? (who.role === "anon" ? 401 : 403) : err.code === "GS404" ? 404 : 400;
      return json({ code: err.code ?? "XX000", message: err.message ?? "error", details: null, hint: null }, status);
    }
  }

  // ---- Storage ---------------------------------------------------------------------------------------------
  async function upload(path: string, req: Request, who: NonNullable<Awaited<ReturnType<typeof caller>>>) {
    let file: { size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> } | undefined;
    const ctype = req.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (ctype.startsWith("multipart/")) {
      // Bun's formData() drops the empty-named field storage-js uses for the file, so read the parts by hand.
      const boundary = enc.encode(`--${ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean)}`);
      const text = Buffer.from(bytes);
      let from = text.indexOf(boundary);
      while (from !== -1 && !file) {
        const next = text.indexOf(boundary, from + boundary.length);
        if (next === -1) break;
        const part = text.subarray(from + boundary.length + 2, next - 2); // drop CRLF after boundary and before the next
        const split = part.indexOf(Buffer.from([13, 10, 13, 10]));
        const head = part.subarray(0, split).toString();
        if (head.includes('name=""')) {
          const body = part.subarray(split + 4);
          const type = head.split(String.fromCharCode(13, 10)).find((l) => l.toLowerCase().startsWith("content-type:"))?.slice(13).trim() ?? "";
          file = { size: body.length, type, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) as ArrayBuffer };
        }
        from = next;
      }
    } else {
      file = { size: bytes.byteLength, type: ctype, arrayBuffer: async () => bytes.buffer as ArrayBuffer }; // raw body upload
    }
    if (!file) return json({ statusCode: "400", error: "invalid_request", message: "No file" }, 400);
    const [bucket] = (await db.query(`select * from storage.buckets where id = 'brand'`)).rows as any[];
    if (file.size > Number(bucket.file_size_limit)) return json({ statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" }, 413);
    if (!bucket.allowed_mime_types.includes(file.type)) return json({ statusCode: "415", error: "invalid_mime_type", message: `mime type ${file.type} is not supported` }, 415);
    try {
      await serial(() => as(db, who.role, who.claims, () => db.query(`insert into storage.objects (bucket_id, name) values ('brand', $1)`, [path])));
    } catch {
      return json({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }, 400);
    }
    objects.set(path, { bytes: await file.arrayBuffer(), type: file.type });
    return json({ Id: crypto.randomUUID(), Key: `brand/${path}` });
  }

  // ---- routing ---------------------------------------------------------------------------------------------
  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const body = method === "GET" || method === "DELETE" || path.startsWith("/storage/") ? {} : await req.json().catch(() => ({}));

    if (path === "/auth/v1/.well-known/jwks.json") return json({ keys: [jwk] });

    if (path.startsWith("/rest/v1/rpc/")) {
      const who = await caller(req);
      if (!who) return json({ code: "PGRST301", message: "JWT invalid", details: null, hint: null }, 401);
      return rpc(path.slice("/rest/v1/rpc/".length), body, who);
    }

    // GoTrue admin: service role only
    if (path.startsWith("/auth/v1/admin/")) {
      if (bearer(req) !== FAKE_KEYS.secret) return goTrueError(403, "not_admin", "User not allowed");
      if (path === "/auth/v1/admin/generate_link" && method === "POST") {
        const { type, email, password } = body as { type: string; email: string; password?: string };
        let user = await userByEmail(email);
        if (type === "signup") {
          if (user) return goTrueError(422, "email_exists", "A user with this email address has already been registered");
          user = (await db.query(`insert into auth.users (email) values ($1) returning *`, [email])).rows[0];
          passwords.set(email, password ?? "");
        } else if (!user) return goTrueError(404, "user_not_found", "User not found");
        const hashed_token = `hash-${rand(20)}`;
        linkTokens.set(hashed_token, { userId: user.id, type });
        return json({ ...userJson(user), action_link: `${origin}/auth/v1/verify?token=${hashed_token}&type=${type}`, email_otp: "123456", hashed_token, redirect_to: "", verification_type: type });
      }
      if (path === "/auth/v1/admin/users" && method === "POST") {
        const { email, password, email_confirm, app_metadata } = body as any;
        if (await userByEmail(email)) return goTrueError(422, "email_exists", "A user with this email address has already been registered");
        const u = (await db.query(`insert into auth.users (email, email_confirmed_at, raw_app_meta_data) values ($1, $2, $3) returning *`, [email, email_confirm ? new Date().toISOString() : null, JSON.stringify(app_metadata ?? {})])).rows[0];
        if (password) passwords.set(email, password);
        return json(userJson(u));
      }
      const m = path.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
      if (m && method === "PUT") {
        const { app_metadata, password, email_confirm } = body as any;
        if (app_metadata) await db.query(`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || $2::jsonb where id = $1`, [m[1], JSON.stringify(app_metadata)]);
        if (email_confirm) await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [m[1]]);
        if (password) passwords.set((await userRow(m[1])).email, password);
        return json(userJson(await userRow(m[1])));
      }
      if (m && method === "DELETE") {
        await db.query(`delete from auth.users where id = $1`, [m[1]]);
        return json({});
      }
    }

    if (path === "/auth/v1/verify" && method === "POST") {
      const { token_hash } = body as { token_hash: string };
      const entry = linkTokens.get(token_hash);
      if (!entry) return goTrueError(403, "otp_expired", "Email link is invalid or has expired");
      linkTokens.delete(token_hash); // one use
      await db.query(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1`, [entry.userId]);
      return json(await session(entry.userId));
    }

    if (path === "/auth/v1/token" && method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const { email, password } = body as { email: string; password: string };
        const u = await userByEmail(String(email).toLowerCase());
        if (!u || passwords.get(u.email) !== password) return goTrueError(400, "invalid_credentials", "Invalid login credentials");
        if (!u.email_confirmed_at) return goTrueError(400, "email_not_confirmed", "Email not confirmed");
        return json(await session(u.id));
      }
      if (grant === "refresh_token") {
        const r = refreshTokens.get((body as any).refresh_token);
        if (!r) return goTrueError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        return json(await session(r.userId, r.aal));
      }
    }

    if (path === "/auth/v1/user") {
      const claims = await verifyJwt(bearer(req));
      if (!claims) return goTrueError(401, "bad_jwt", "invalid JWT");
      if (method === "GET") return json(userJson(await userRow(claims.sub)));
      if (method === "PUT") {
        const { password } = body as { password?: string };
        if (password) {
          if (password.length < 15) return goTrueError(422, "weak_password", "Password should be at least 15 characters.");
          passwords.set((await userRow(claims.sub)).email, password);
        }
        return json(userJson(await userRow(claims.sub)));
      }
    }
    if (path === "/auth/v1/logout") return new Response(null, { status: 204 });

    // MFA (TOTP)
    if (path === "/auth/v1/factors" && method === "POST") {
      const claims = await verifyJwt(bearer(req));
      if (!claims) return goTrueError(401, "bad_jwt", "invalid JWT");
      const id = crypto.randomUUID();
      const secret = b32encode(crypto.getRandomValues(new Uint8Array(20)));
      factors.set(id, { id, userId: claims.sub, secret, verified: false });
      const uri = `otpauth://totp/Gentrep:${(await userRow(claims.sub)).email}?secret=${secret}&issuer=Gentrep`;
      return json({ id, type: "totp", friendly_name: "Authenticator", totp: { qr_code: `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>`, secret, uri } });
    }
    const f = path.match(/^\/auth\/v1\/factors\/([0-9a-f-]{36})(\/challenge|\/verify)?$/);
    if (f) {
      const claims = await verifyJwt(bearer(req));
      const factor = factors.get(f[1]);
      if (!claims || !factor || factor.userId !== claims.sub) return goTrueError(404, "mfa_factor_not_found", "MFA factor not found");
      if (f[2] === "/challenge") {
        const cid = crypto.randomUUID();
        challenges.set(cid, factor.id);
        return json({ id: cid, type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
      }
      if (f[2] === "/verify") {
        const { challenge_id, code } = body as { challenge_id: string; code: string };
        if (challenges.get(challenge_id) !== factor.id) return goTrueError(400, "mfa_challenge_expired", "MFA challenge has expired");
        const now = Date.now();
        const valid = (await Promise.all([-30_000, 0, 30_000].map((d) => totp(factor.secret, now + d)))).includes(String(code));
        if (!valid) return goTrueError(400, "mfa_verification_failed", "Invalid TOTP code entered");
        challenges.delete(challenge_id);
        factor.verified = true;
        return json(await session(factor.userId, "aal2"));
      }
      if (method === "DELETE") {
        factors.delete(factor.id);
        return json({ id: factor.id });
      }
    }

    // Storage
    const up = path.match(/^\/storage\/v1\/object\/brand\/(.+)$/);
    if (up && (method === "POST" || method === "PUT")) {
      const who = await caller(req);
      if (!who || who.role === "anon") return json({ statusCode: "403", error: "Unauthorized", message: "Unauthorized" }, 400);
      return upload(decodeURIComponent(up[1]), req, who);
    }
    const pub = path.match(/^\/storage\/v1\/object\/public\/brand\/(.+)$/);
    if (pub && method === "GET") {
      const o = objects.get(decodeURIComponent(pub[1]));
      return o ? new Response(o.bytes, { headers: { "content-type": o.type } }) : json({ statusCode: "404", error: "not_found", message: "Object not found" }, 404);
    }

    // Test helpers, never present in real Supabase
    if (path === "/__fake/totp" && method === "GET") {
      const email = url.searchParams.get("email") ?? "";
      const u = await userByEmail(email);
      const factor = [...factors.values()].find((x) => x.userId === u?.id);
      return json({ code: factor ? await totp(factor.secret) : null });
    }
    return json({ message: "not found in fake" }, 404);
  }

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-upsert, cache-control, prefer",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const res = await handle(req);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    },
  });
  origin = `http://127.0.0.1:${server.port}`;

  return {
    url: origin,
    db,
    keys: FAKE_KEYS,
    stop: () => server.stop(true),
    /** Sets a password and confirms an account, for seeds and tests. */
    async addUser(email: string, password: string, opts: { confirmed?: boolean; appMetadata?: object } = {}) {
      const u = (await db.query(`insert into auth.users (email, email_confirmed_at, raw_app_meta_data) values ($1, $2, $3) returning id`, [email, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify(opts.appMetadata ?? {})])).rows[0] as { id: string };
      passwords.set(email, password);
      return u.id;
    },
    /** Pre-enrols a verified TOTP factor and returns its secret. */
    enrolFactor(userId: string) {
      const id = crypto.randomUUID();
      const secret = b32encode(crypto.getRandomValues(new Uint8Array(20)));
      factors.set(id, { id, userId, secret, verified: true });
      return secret;
    },
  };
}
