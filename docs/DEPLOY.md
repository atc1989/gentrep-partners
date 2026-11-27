# DEPLOY.md

Two Supabase projects (`gentrep-sites-dev` now, production at launch), one Vercel project with two services from `vercel.json` (web + api container, one domain), Resend for email. Steps marked **Owner** need your accounts. Claude does the rest.

Environments (playbook: 06 - Deploy): local (Docker Supabase, fake data) -> dev project (staging site at `*.staging.gentrep.xyz`) -> production (`*.gentrep.xyz`, after launch checks). Nothing is shared between them: own keys, own database.

## 1. Dev Supabase project (Owner creates, Claude applies)

1. **Owner:** new project `gentrep-sites-dev`, region Singapore. Dashboard -> Project Settings -> API: copy the project URL, the publishable key and the secret key. Keep them in a password manager, never in chat.
2. **Owner:** put them in `apps/api/.env` (see `.env.example`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) and `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Also the project reference and database password for linking.
3. **Claude:** `supabase link --project-ref <ref>`, `supabase db push` (applies `supabase/migrations/*`), then the checks below.
4. Auth settings (dashboard -> Authentication, or `supabase config push` after reviewing `supabase/config.toml`): public sign-up OFF (`[auth] enable_signup = false`), keep `[auth.email] enable_signup = true` (it is the provider switch), minimum password length 15, access token lifetime 900 s, refresh token rotation on, TOTP MFA enrol and verify ON, anonymous sign-ins off, site URL and redirect list = the staging address. Leaked-password protection and the inactivity timeout are paid-plan settings.
5. `supabase db lint`, then Advisors in the dashboard.

## 2. Email: Resend (Owner)

1. New Resend account (a new data processor: it is listed in the privacy notice). Verify a sending subdomain, for example `mail.gentrep.xyz`: add the SPF and DKIM records Resend shows. Add DMARC on the root (`p=none` first). Root domain that sends no mail: `v=spf1 -all`.
2. API key -> `RESEND_API_KEY`; sender -> `EMAIL_FROM` (`Gentrep <no-reply@mail.gentrep.xyz>`).
3. Send one sign-up link and one reset to an outside mailbox. Check the headers show SPF, DKIM and DMARC pass.

## 3. Vercel (Owner)

1. Add the repo (private). Leave Root Directory at the repo root: `vercel.json` defines both services. Region `sin1`.
2. Domains: add `gentrep.xyz`, `*.gentrep.xyz` (staging: `staging.gentrep.xyz` and `*.staging.gentrep.xyz`). The domain's nameservers must be Vercel's: a wildcard needs Vercel to issue the wildcard certificate. Copy any existing DNS records (email!) first.
3. Environment variables (one set per environment; staging uses the DEV project's keys):

| Variable | Value | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | web (browser) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | web (browser) |
| `NEXT_PUBLIC_API_URL` | `/api` | web |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `staging.gentrep.xyz` / `gentrep.xyz` | web, proxy |
| `NEXT_PUBLIC_LEGAL_DRAFT` | `true` until a lawyer or the DPO has read the terms and privacy notice | web |
| `NEXT_PUBLIC_OPERATOR_NAME`, `_ADDRESS`, `NEXT_PUBLIC_DPO_EMAIL` | the legal entity running the platform | web (legal pages) |
| `APP_ENV` | `staging` / `production` | api |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | as above | api |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` (never `NEXT_PUBLIC_`) | api |
| `ROOT_DOMAIN` | same as `NEXT_PUBLIC_ROOT_DOMAIN` | api (links in emails) |
| `EMAIL_MODE` | `resend` | api |
| `RESEND_API_KEY`, `EMAIL_FROM` | from step 2 | api |
| `PORT` | `4000` | api |

Do **not** set `API_ORIGIN` on Vercel (local only). `NEXT_PUBLIC_*` is baked into the build: redeploy after changing one.
4. Branches: `sandbox` -> the staging site, `main` -> production. Preview builds use dev variables, never production's.
5. After deploy: `https://<root>/api/health` answers `{"ok":true}`; a call with no token gets 401; `curl -I` shows the CSP and `X-Frame-Options`.

## 4. First super admin (Owner runs it)

`cd apps/api && bun scripts/create-super-admin.ts you@yourdomain.com` with the target project's keys in `apps/api/.env`. It prints a one-time link: open it, choose a password (15+), then set up the authenticator app. Enrol a second super admin before launch, and keep a break-glass way to reset a factor outside the app.

## 5. Checks before the real address opens

- `bun run test`, then `bun run test:e2e` against the dev project (`E2E_ALLOW_HOSTED=1`, dev only).
- Attack pass on the dev project (playbook: 06 - Security Testing), threat model updated.
- Terms and privacy notice reviewed; `NEXT_PUBLIC_LEGAL_DRAFT=false`; no `[bracket]` left on those pages.
- Restore a backup once and record the time (playbook: 07 - Incident Response). Fill in the incident page (DPO contact, NPC reporting link).
- Production Supabase project created (paid plan: leaked-password protection, inactivity timeout, backups), its own keys, migrations applied by the owner. Never from an agent.

## Rollback

Code only: put the previous Vercel build live, fix forward on a branch. A migration: leave additive changes, ship a new migration that restores the old function or policy body. Never edit a migration that has run. Never weaken a policy to get a release out.

## Running the API image locally

```bash
docker build -f Dockerfile.api -t gentrep-api .
docker run --rm --env-file apps/api/.env -p 4000:4000 gentrep-api
```
