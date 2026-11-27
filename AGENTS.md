# Gentrep Sites — notes for the agent

**Not live yet.** Built against a local Supabase (Docker) and, after the owner adds keys, a **dev** Supabase project. No production project exists. Read this file first, then open only the files the task touches.

A whitelabel platform. A business signs up on `gentrep.xyz`, gets `slug.gentrep.xyz` (landing page, registration page, its own admin). People register on the tenant's page; the tenant's admin sees them. A super admin runs the platform. Plan, decisions and what was left out on purpose: `docs/PLAN.md`.

## Layout

```
apps/api     Elysia on Bun. src/index.ts wires routes and exports App (Eden types). Every data call is one Supabase rpc.
  src/auth.ts      Bearer only (never cookies): getClaims, rate limit, an RLS-scoped client per request
  src/db.ts        anon (3 public functions), userClient(token) for ALL data, serviceClient() for Auth admin only; must() maps errors to fixed sentences
  src/routes/      public.ts (no sign-in, per-IP limits), admin.ts (/me, /admin: a tenant's own admin), platform.ts (/platform: super admin)
  src/shared.ts    pure helpers used by api AND web: slug, PH mobile, colour theme, csv, response types
apps/web     Next 16 (App Router), Tailwind v4. proxy.ts maps slug.domain/x -> app/s/[slug]/x (address bar unchanged)
  app/(platform)/   gentrep.xyz: sign-up, terms, privacy, /admin (super admin)
  app/s/[slug]/     tenant: (site) landing/registration/privacy, (auth) confirm/forgot, admin/(app) registrations, site editor, account
  components/sky/   public look (Sky design system); components/crm.tsx + components/admin/  admin look (CRM)
  lib/api.ts        Eden client (browser sends Bearer); lib/server.ts getSite() for server components
supabase/    migrations/ (one file so far), tests/ (db.test.ts PGlite, fake-supabase.ts, e2e.ts), config.toml (ports 56321+)
docs/        PLAN, THREAT_MODEL, DEPLOY
```

**The database is the wall.** Tenant comes from `app.my_tenant()` (membership table), never from the request. Every table has RLS and a `tenant_id`; clients have SELECT only; every write is a SQL function that checks its caller (`app.require_tenant()`, `app.require_platform()`). The API and the web checks are early, friendly errors. RLS and the functions are the enforcement: add a policy or a function, never use the service role for data.

Roles: **super admin** (`app.platform_admins`, counts only at aal2 = second factor), **tenant admin** (one per tenant, one tenant per user), **registrant** (a row, no login; a private emailed link opens their own invite QR page). Platform staff see registrations only through `platform_grant_support` (reason, 1 hour, logged, shown to the tenant).

## Commands

- `bun run typecheck` · `bun run test` (PGlite policy tests + API tests on a Supabase test double + unit tests; offline) · `bun run build`
- `supabase start` (Docker; ports 56321+ so it can sit beside other projects), then `bun run test:e2e` runs the API tests against the real local stack. For a dev project set `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_SUPABASE_SECRET_KEY` and `E2E_ALLOW_HOSTED=1` (it creates fake tenants: dev only).
- Local app: API `cd apps/api && bun src/index.ts` (:4000, `.env` from `.env.example`, `EMAIL_MODE=console` prints links), web `cd apps/web && bun run dev` (:3000). Tenant sites are `slug.localhost:3000`. `NEXT_PUBLIC_*` is baked in at build: restart after changing it.
- First super admin: `cd apps/api && bun scripts/create-super-admin.ts you@example.com`
- New migration: `supabase/migrations/2026MMDD0000NN_name.sql` with RLS on, grants revoked then granted back, function execute revoked from public/anon/authenticated then granted. Add its test to `supabase/tests/db.test.ts` first. Apply to the DEV project by hand.

## Never

- **Never apply a migration, run tests or create test data against a production project.** Production does not exist yet; when it does, only the owner releases to it. `supabase db reset --linked` is forbidden.
- Never use the service role for data. `serviceClient()` is Auth admin only (create sign-up link, set pending metadata, first super admin).
- Never read a tenant id from the request, never put `role`/`tenant_id`/`status` in a body schema, never weaken a policy to make a feature work.
- Never log tokens or request bodies. Never put a secret in `NEXT_PUBLIC_*`. Only the Supabase URL, publishable key, `/api` and the root domain reach the browser.
- Never set a cookie `Domain`: sessions are host-only so a sign-in on one tenant never reaches another.
- Never commit, push or merge unless the owner asks.

## Deploy

Vercel services (`vercel.json`): `web` (Next) and `api` (container from `Dockerfile.api`), one domain, `/api/*` routed to the API. Steps and every variable: `docs/DEPLOY.md`. Check a deploy: `/api/health`, a request with no token gets 401, response headers carry the CSP.

## Conventions and gotchas

- Public look = Sky (`styles/sky.css`, tenant colour via `deriveTheme`), admin look = CRM (`styles/crm.css`). Colour only from tokens. Light only on public pages; admin follows the OS.
- Times shown in company time (UTC+8). PH mobile stored as `+639XXXXXXXXX`. Passwords 15+ characters (`PASSWORD_MIN`).
- Elysia runs with `normalize: false`: unknown body fields are rejected (422), not dropped.
- Public routes are exactly: site lookup, slug check, tenant sign-up, registration, member card (private invite link), password-reset request. Adding one needs a threat-model row. anon may execute exactly four SQL functions (`get_site`, `slug_status`, `register_member`, `get_member_card`).
- Invite QR: every registration gets a random 6-digit code. `slug.domain/j/<code>` sets the host-only cookie `gs_ref` (30 days) and opens the form, so a new person is recorded as invited by that code. A person opens their own QR page, with no login, through the private link in the email (`/my-qr#k=<token>`; the token is HMAC(`LINK_SECRET`, email), the table keeps only its sha256). The thank-you screen never shows a code, so a repeat registration looks identical to a new one. The tenant's form settings (category list, address, where found) live in `site_settings.reg_*`.
- This is NOT the Next.js you know: read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing Next code (params are Promises, `proxy.ts` replaces middleware).
