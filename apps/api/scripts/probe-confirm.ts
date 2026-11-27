// Probe: can an account made by a sign-up link sign in before the link is used? It must not.
// Run against a dev project only: cd apps/api && bun scripts/probe-confirm.ts (reads .env). Deletes its own user.
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries((await Bun.file(`${import.meta.dir}/../.env`).text()).split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/"/g, "")]));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, opts);

const email = `probe-confirm-${Date.now()}@example.test`;
const password = "correct-horse-battery-staple";
const link = await svc.auth.admin.generateLink({ type: "signup", email, password });
if (link.error) throw new Error(`generateLink: ${link.error.message}`);
console.log("confirmed right after generateLink:", Boolean(link.data.user.email_confirmed_at));
const tryIn = await anon.auth.signInWithPassword({ email, password });
console.log("sign-in before using the link:", tryIn.error ? `refused (${tryIn.error.code})` : "ALLOWED  <-- problem");
await svc.auth.admin.deleteUser(link.data.user.id);
