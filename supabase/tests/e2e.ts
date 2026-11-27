// Runs the API tests against a REAL Supabase: the local stack by default (`supabase start`), or a dev project.
// The tests create tenants and registrations, so they refuse a hosted project unless you say so on purpose.
import { $ } from "bun";

let url = Bun.env.E2E_SUPABASE_URL;
let publishable = Bun.env.E2E_SUPABASE_PUBLISHABLE_KEY;
let secret = Bun.env.E2E_SUPABASE_SECRET_KEY;

if (!url) {
  const out = await $`supabase status -o env`.quiet().text();
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\n]+)"?`, "m"))?.[1];
  url = get("API_URL");
  publishable = get("PUBLISHABLE_KEY") ?? get("ANON_KEY");
  secret = get("SECRET_KEY") ?? get("SERVICE_ROLE_KEY");
}
if (!url || !publishable || !secret) throw new Error("No Supabase found. Run `supabase start`, or set E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY, E2E_SUPABASE_SECRET_KEY.");

const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
if (!local && Bun.env.E2E_ALLOW_HOSTED !== "1") {
  throw new Error(`${url} is not local. These tests create fake tenants and people. Use the DEV project only, never production, and set E2E_ALLOW_HOSTED=1 to confirm.`);
}

const proc = Bun.spawn(["bun", "test", "apps/api/src/app.test.ts"], {
  env: { ...Bun.env, E2E_SUPABASE_URL: url, E2E_SUPABASE_PUBLISHABLE_KEY: publishable, E2E_SUPABASE_SECRET_KEY: secret },
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await proc.exited);
