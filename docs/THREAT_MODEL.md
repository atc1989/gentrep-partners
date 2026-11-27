# Threat model: Gentrep Sites

One page, written before the first migration was applied (playbook: 04 - Threat Model Template). Every row names the code that stops it and the test that proves it.

## Assets
1. The people who registered on a tenant's page: name, email, mobile, city. Personal data of strangers, held for the tenant.
2. Tenant admin and super admin sessions.
3. A tenant's public site (it carries their name: a defaced or impersonating page harms them and the platform).
4. The audit log.

## Actors
- **Outsider**: no account. May flood forms, enumerate, try injection.
- **Registrant**: gives details, has no login.
- **Tenant admin**: trusted with their own tenant. May try to read or change another tenant.
- **Super admin**: sees all tenants. The most dangerous account.
- **Compromised account**: a valid session in the wrong hands.

## Trust boundaries
browser -> web (Next) -> API (Elysia) -> Supabase (SQL functions + RLS); browser -> Supabase directly (sign-in, MFA, image upload, and any REST call with the same token); API -> Supabase service role (Auth admin only).

## Threats and mitigations
| # | Threat | Mitigation | Where / test |
|---|---|---|---|
| T1 | Tenant A reads or changes tenant B's data | Tenant from `app.my_tenant()`; RLS on every table; clients have SELECT only; writes in functions that filter by caller | `20261126000001_init.sql`; `db.test.ts` "tenant isolation", "structure" |
| T2 | A request names another tenant (id swap) | No tenant id accepted from the request except for platform admins, who are checked in SQL | `app.require_tenant`, `list_registrations`; `db.test.ts` |
| T3 | Body carries `role`, `tenant_id`, `status` | `normalize: false` + `additionalProperties: false`: unknown fields are 422; column grants block them anyway | `apps/api/src/index.ts`, `schema.ts`; `app.test.ts` |
| T4 | Anyone calls a function they should not | Execute revoked from public/anon/authenticated, granted back per function; anon has exactly 4 (`get_site`, `slug_status`, `register_member`, `get_member_card`) | `db.test.ts` "anon can execute exactly four" |
| T5 | Super admin reads people without reason | `platform_grant_support`: reason >= 10 chars, 1 hour, logged, shown to the tenant; aal2 required | `db.test.ts`, `app.test.ts` "people stay closed" |
| T6 | Super admin account taken | Second factor (TOTP) required for every platform function; no sign-up screen; created by a command | `app.require_platform`; `create-super-admin.ts`; MFA tests |
| T7 | Weak or stolen tenant admin password | 15+ chars; GoTrue rate limits; reset by emailed one-time link; no cookie sharing between addresses | `schema.ts`, `config.toml`; accepted gaps below |
| T8 | Sign-up or registration used to find who has an account | Sign-up and reset answer the same for known and unknown emails; a repeat registration looks identical | `public.ts`; `app.test.ts` |
| T9 | Form flooding / fake sites | Per-IP limits, trap field, per-tenant 500 registrations/hour, 200 sites/hour, reserved list, suspend button | `limits.ts`, `public.ts`, `register_member`, `activate_my_tenant` |
| T10 | Impersonation (a bank's name as an address) | Reserved list (editable), super admin can rename or suspend | `reserved_slugs`; tests |
| T11 | Tenant text becomes HTML, script or a `javascript:` link | React escapes text; links shown only if http(s) (DB check + `safeUrl`); colours pass through a validated hex | `shared.ts`, table checks; `shared.test.ts` |
| T12 | Image upload abuse (script in an SVG, huge file, another tenant's folder) | Bucket allows png/jpeg/webp, 2 MB; policy: own folder, generated name; DB check ties the path to the tenant | storage policies; `app.test.ts` "brand images" |
| T13 | CSV injection in the export | Cells starting `= + @ tab CR -` get a quote | `csvCell`; `shared.test.ts`, `app.test.ts` |
| T14 | Errors leak table or column names | `must()` maps SQLSTATE to fixed sentences | `db.ts`; `app.test.ts` |
| T15 | Cross-site request forgery | API reads a Bearer header only, never a cookie | `auth.ts` |
| T16 | Stolen session in one tenant used in another | Session cookie is host-only; each address signs in separately | `lib/supabase.ts` |
| T17 | Link tokens leak via logs, referrers or email scanners | Token is after `#` (never sent to a server), removed from the address bar at once, one use, 1 hour; `Referrer-Policy` set | `email.ts`, `auth-flows.tsx`; `app.test.ts` "works once" |
| T18 | Clickjacking, sniffing, mixed content | CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, HSTS | `apps/web/next.config.ts` |
| T19 | Secrets in the browser or the repo | Only public values are `NEXT_PUBLIC_*`; `.env*` ignored; service key only in the API | `env.ts`, `.gitignore` |
| T20 | Suspended tenant keeps acting | `app.my_tenant()` returns null when suspended; public pages say unavailable | `db.test.ts` "suspending" |
| T21 | Audit log edited | Append-only triggers incl. TRUNCATE; no write grant | `db.test.ts` "audit log" |
| T22 | Registrant asks to be removed | Tenant admin deletes one record (logged, no personal data in the log) | `delete_registration` |
| T23 | A tenant's people exported without trace | `export_registrations` logs the row count with the actor | `db.test.ts`, `app.test.ts` |
| T24 | Someone opens another person's invite page (guesses or reuses a private link) | The token is HMAC-SHA256(`LINK_SECRET`, email), 256 bits. The table keeps only sha256(token), never granted to a client, never in a list, export or log. `get_member_card` needs tenant and hash, and returns only the code and a count: no name, no email. 30 tries a minute per visitor | `member.ts`, `get_member_card`; `db.test.ts` "member card", "link hash"; `app.test.ts` "private link" |
| T25 | The form used to flood someone's inbox with invite emails | At most 3 invite emails per address an hour (in memory), 10 registrations a minute per visitor; a failed send never fails the registration | `public.ts`; `app.test.ts` "one address gets at most 3" |
| T26 | A repeat registration, or an invite email, reveals that an address is known | Every registration sends the same email and gets the same answer. The thank-you screen shows no code and no QR. A repeat keeps its first link and only fills a missing one | `register_member`; `app.test.ts` "a repeat sends the same link"; `db.test.ts` "a repeat registration keeps its first link" |
| T27 | An invite code used to count a tenant's people or to credit someone in another tenant | Codes are random 6-digit numbers, not a counter, unique per tenant. A code from another tenant, or an unknown one, is ignored without an error. The list filter by code is the tenant's own | `app.pick_member_code`, `register_member`; `db.test.ts` "an invite code credits the inviter, only inside the same tenant" |
| T28 | Someone calls the database directly and registers a victim's email with a link hash of their own (accepted) | They learn only that row's code and invite count. The real owner's emailed link then does not open the page until the tenant admin deletes the junk row and the owner registers again. No data is exposed | none: accepted, see Known gaps |

## Known gaps (accepted)
- Rate limits are in memory per API instance. Fix: Redis before a second instance.
- No breached-password check, inactivity timeout or leaked-password protection: paid Supabase plan settings. Fix: switch on with the production plan.
- No CAPTCHA. Fix when spam shows up.
- CSP allows `'unsafe-inline'` scripts (Next inline bootstrap). Fix: nonces if a third-party script is added.
- No malware scan on uploads (images only, type and size limited).
- Tenant admins have no second factor yet. Fix: reuse `MfaFlow` for tenant admins.
- Replaced images stay in storage (orphans). Fix: a sweep script.
- Unconfirmed sign-ups leave an unused auth user. Fix: a periodic purge.
- Terms and privacy text are drafts; fees, retention periods, regions and the operator's details are blank on purpose.
- Registrant data is kept until deleted: the tenant sets retention.
- A private invite link stays valid until `LINK_SECRET` changes (T24): there is no per-person revoke. Fix: store a rotation counter per person.
- The invite email is a plain-text message through Resend (a processor); a person's link is in it. See docs/DEPLOY.md.
- The browser screens were checked by code review and a production build only, not in a browser (see the hand-over note).
