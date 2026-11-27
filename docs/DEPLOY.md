# DEPLOY.md

Two Supabase projects (`gentrep-sites-dev` now, production at launch), one Vercel project with two services from `vercel.json` (web + api container, one domain), Resend for email. Steps marked **Owner** need your accounts. Claude does the rest.

Environments (playbook: 06 - Deploy): local (Docker Supabase, fake data) -> dev project (staging site at `*.staging.gentrep.xyz`) -> production (`*.gentrep.xyz`, after launch checks). Nothing is shared between them: own keys, own database. Staging stays after launch: it is where every change is checked before it reaches production.

| | Staging | Production |
|---|---|---|
| Addresses | `staging.gentrep.xyz`, `*.staging.gentrep.xyz` | `gentrep.xyz`, `*.gentrep.xyz` |
| Git branch | `sandbox` | `main` |
| Vercel environment | Preview, variables scoped to branch `sandbox` | Production |
| Supabase project | dev (fake data) | production (real data) |
| `APP_ENV` | `staging` | `production` |
| `LINK_SECRET`, keys, Resend key | its own | its own, never the staging value |

Flow: feature branch -> PR into `sandbox` -> check on staging -> PR `sandbox` into `main`. **Claude never touches the production Supabase project: no migration, no test run, no test data.** The owner applies migrations there by hand, schema first, code second. The Supabase CLI in this repo is linked to the DEV project: a plain `supabase db push` hits dev, so for production the owner runs `supabase db push --db-url "<production url>"` from their own terminal. Never `db reset --linked`, never `config push` (`config.toml` has `site_url = localhost`).

Staging serves `Disallow: /` in `robots.txt` (see `robotsText` in `apps/web/lib/host.ts`), keyed on `NEXT_PUBLIC_ROOT_DOMAIN` starting with `staging.`.

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
| `LINK_SECRET` | 32+ random characters (`openssl rand -base64 32`), mark **Sensitive**. Signs each person's private invite link; changing it breaks every link already emailed, so set it once per environment and keep it | api |
| `PORT` | `4000` | api |

Do **not** set `API_ORIGIN` on Vercel (local only). `NEXT_PUBLIC_*` is baked into the build: redeploy after changing one.
4. Branches: `sandbox` -> the staging site, `main` -> production. In Vercel the staging variables live in the **Preview** environment scoped to branch `sandbox`; the Production environment holds production values only. Set the staging domains to the git branch `sandbox`. Do the split (create `sandbox`, copy variables to Preview, move the staging domains, check staging) **before** putting any production value in the Production environment. Other preview builds use dev variables, never production's. Protect `main` on GitHub: pull request and passing CI required, no force-push.
5. After deploy: `https://<root>/api/health` answers `{"ok":true}`; a call with no token gets 401; `curl -I` shows the CSP and `X-Frame-Options`.

## 4. First super admin (Owner runs it)

`cd apps/api && bun scripts/create-super-admin.ts you@yourdomain.com` with the target project's keys in `apps/api/.env`. It prints a one-time link: open it, choose a password (15+), then set up the authenticator app. Enrol a second super admin before launch, and keep a break-glass way to reset a factor outside the app.

## 5. Checks before the real address opens

- `bun run test`, then `bun run test:e2e` against the dev project (`E2E_ALLOW_HOSTED=1`, dev only).
- Attack pass on the dev project (playbook: 06 - Security Testing), threat model updated.
- Terms and privacy notice reviewed; `NEXT_PUBLIC_LEGAL_DRAFT=false`; no `[bracket]` left on those pages.
- Restore a backup once and record the time (playbook: 07 - Incident Response). Fill in the incident page (DPO contact, NPC reporting link).
- Production Supabase project created (paid plan: leaked-password protection, inactivity timeout, backups), its own keys, migrations applied by the owner. Never from an agent.

## Production variables (fill-in block)

Vercel -> Settings -> Environment Variables, **Production only** (untick Preview and Development). Replace every `<...>`. Real values stay in the password manager: never in chat, this file or the repo. Do this only after staging runs from `sandbox` (section 3, step 4).

```
# web (baked into the build: redeploy after changing)
NEXT_PUBLIC_SUPABASE_URL=https://<production-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_... of the PRODUCTION project>
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_ROOT_DOMAIN=gentrep.xyz
NEXT_PUBLIC_LEGAL_DRAFT=true            # false only after the terms and privacy notice are reviewed
NEXT_PUBLIC_OPERATOR_NAME=<legal entity name>
NEXT_PUBLIC_OPERATOR_ADDRESS=<legal entity address>
NEXT_PUBLIC_DPO_EMAIL=<data protection contact>

# api (mark the secrets Sensitive)
APP_ENV=production
SUPABASE_URL=https://<production-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<same publishable key>
SUPABASE_SECRET_KEY=<sb_secret_... of the PRODUCTION project>   # Sensitive
ROOT_DOMAIN=gentrep.xyz
EMAIL_MODE=resend
RESEND_API_KEY=<production Resend key>                          # Sensitive
EMAIL_FROM=Gentrep <no-reply@mail.gentrep.xyz>
LINK_SECRET=<new 32+ character value, see below>                # Sensitive, never the staging value
PORT=4000
```

Not set on Vercel: `API_ORIGIN`. Not shared with staging: any key, `LINK_SECRET` or the Resend key.

Make `LINK_SECRET` on your own machine (PowerShell), copy it straight into Vercel and the password manager, and do not paste it anywhere else:

```powershell
bun -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"
```

Set it once. Changing it later breaks every invite link already emailed.

## Release to production

Owner, with someone watching, not before a weekend.

1. PR `sandbox` into `main`, CI green.
2. Apply the new migration files to the production project by hand (first release: all of them, in order). Schema first.
3. Merge: Vercel deploys `main` with the Production variables.
4. First time only: create the first super admin with the production keys (section 4) and enrol a second one.
5. Read-only checks, no test rows: `/api/health`, a request with no token gets 401, CSP and `X-Frame-Options` present, landing and sign-up load, watch logs for ten minutes. Registration and sign-up flows are proven on staging with the same commit.
6. One dated line in the change log: what shipped, which migration.

## Launch checklist (after the deploy, production is read-only)

No test rows and no sign-ups on production. Registration, the emailed link and the invite scan are proven on staging with the same commit; production only gets the reads below. Replace `<slug>` with a real, active tenant once one exists. PowerShell; use `curl.exe`, not `curl`.

Before the deploy
- [ ] Both migrations are on the production project (`supabase migration list --db-url "<production url>"` shows local and remote equal), applied by you.
- [ ] Staging (from `sandbox`, same commit) passed: register, emailed link opens `/my-qr`, `/j/<code>` shows "Ref number #...", the admin shows Code and Invited by.
- [ ] Production variables set (block above), `LINK_SECRET` differs from staging's, nothing `NEXT_PUBLIC_` holds a secret.
- [ ] Resend sending domain verified (SPF, DKIM pass); DNS on Vercel; `gentrep.xyz` and `*.gentrep.xyz` show a valid certificate.

After the deploy
- [ ] Health: `curl.exe -s https://gentrep.xyz/api/health` prints `{"ok":true}`.
- [ ] No token: `curl.exe -s -o NUL -w "%{http_code}" https://gentrep.xyz/api/me` prints `401`.
- [ ] Headers: `curl.exe -sI https://gentrep.xyz` shows `Content-Security-Policy` and `X-Frame-Options`.
- [ ] Robots: `curl.exe -s https://gentrep.xyz/robots.txt` does **not** say `Disallow: /` (that is staging only).
- [ ] Member card route answers a bad token with 404 and writes nothing: `curl.exe -s -X POST https://gentrep.xyz/api/public/sites/<slug>/card -H "content-type: application/json" -d '{\"token\":\"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\"}'` prints `{"error":"This link is not valid."}`.
- [ ] Invite scan: `curl.exe -sI https://<slug>.gentrep.xyz/j/100000` shows `307` and `location: /registration`. On an active tenant it also sets `gs_ref` (HttpOnly, SameSite=Lax, Secure, no `Domain`).
- [ ] `https://<slug>.gentrep.xyz/my-qr` with no `#k=` shows "This link does not work", and `/robots.txt` on the tenant lists `Disallow: /my-qr`.
- [ ] Landing and tenant sign-up pages load; the privacy notice mentions the `gs_ref` cookie.
- [ ] First super admin created with the production keys and a second enrolled (section 4); sign-in asks for the second factor.
- [ ] Watch the Vercel and Supabase logs for ten minutes: no 5xx, no token or request body in a log line.
- [ ] One dated line in the change log: what shipped, which migrations.

## Rollback

Code only: put the previous Vercel build live, fix forward on a branch. A migration: leave additive changes, ship a new migration that restores the old function or policy body. Never edit a migration that has run. Never weaken a policy to get a release out.

## Running the API image locally

```bash
docker build -f Dockerfile.api -t gentrep-api .
docker run --rm --env-file apps/api/.env -p 4000:4000 gentrep-api
```
