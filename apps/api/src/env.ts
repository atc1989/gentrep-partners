// Server-only configuration. Bun loads apps/api/.env automatically. Fails fast on missing values so a
// half-configured deploy never serves traffic. (playbook: 06 - Deploy, "Secrets and variables")

function need(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing ${name}; copy apps/api/.env.example to apps/api/.env`);
  return value;
}

export const APP_ENVS = ["local", "staging", "production"] as const;
// Defaults to production: a forgotten variable must never switch on the local-only shortcuts.
const appEnv = (Bun.env.APP_ENV ?? "production") as (typeof APP_ENVS)[number];
if (!APP_ENVS.includes(appEnv)) throw new Error(`APP_ENV must be one of ${APP_ENVS.join(", ")}`);

const emailMode = (Bun.env.EMAIL_MODE ?? "resend") as "resend" | "console" | "memory";
if (!["resend", "console", "memory"].includes(emailMode)) throw new Error("EMAIL_MODE must be resend, console or memory");
if (emailMode !== "resend" && appEnv !== "local") {
  throw new Error(`EMAIL_MODE=${emailMode} prints or keeps sign-in links; it is only allowed with APP_ENV=local`);
}

export const env = {
  APP_ENV: appEnv,
  SUPABASE_URL: need("SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: need("SUPABASE_PUBLISHABLE_KEY"),
  // Auth admin only (create sign-up links, set the pending site). Never reads or writes business data. Never sent to the browser.
  SUPABASE_SECRET_KEY: Bun.env.SUPABASE_SECRET_KEY ?? "",
  // Host (with port when it has one) that tenant sites hang off: gentrep.xyz, staging.gentrep.xyz or localhost:3000.
  ROOT_DOMAIN: need("ROOT_DOMAIN").toLowerCase(),
  EMAIL_MODE: emailMode,
  RESEND_API_KEY: Bun.env.RESEND_API_KEY ?? "",
  EMAIL_FROM: Bun.env.EMAIL_FROM ?? "",
  // Signs each person's private invite link. Changing it breaks every link already emailed. Never sent to the browser.
  LINK_SECRET: Bun.env.LINK_SECRET ?? (appEnv === "local" ? "local-only-link-secret-not-for-real-use" : ""),
  PORT: Number(Bun.env.PORT ?? 4000),
};

if (appEnv !== "local") {
  if (!env.SUPABASE_SECRET_KEY) throw new Error("Missing SUPABASE_SECRET_KEY");
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("Missing RESEND_API_KEY or EMAIL_FROM");
  if (env.LINK_SECRET.length < 32) throw new Error("Missing LINK_SECRET (32 or more characters)");
}

/** Public origin of a tenant's site, or of the platform site when slug is null. */
export function siteOrigin(slug: string | null): string {
  const scheme = env.ROOT_DOMAIN.startsWith("localhost") || env.APP_ENV === "local" ? "http" : "https";
  return `${scheme}://${slug ? `${slug}.` : ""}${env.ROOT_DOMAIN}`;
}
