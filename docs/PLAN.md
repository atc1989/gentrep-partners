# Gentrep Sites: the plan

Agreed in conversation on 2026-11-26. This is the shared understanding the build follows.

## Product
- Separate product: own repo, Vercel project and Supabase projects. GutGuard is untouched.
- Two sign-ups: a business creates a tenant at `gentrep.xyz`; people (customers, members, resellers) register on the tenant's page.
- Three roles: super admin, tenant admin (one per tenant, one tenant per email), registrant (a row, no login, type "member").

## Addresses
- `gentrep.xyz`: sign-up, terms, privacy, `/admin` (super admin). Staging: `*.staging.gentrep.xyz` on the dev database.
- `slug.gentrep.xyz`: landing, `/registration`, `/privacy`, `/admin`.
- Slug auto-fills from the business name, editable at sign-up, live availability check; later changes by super admin only (no redirect from the old one). A reserved list (editable by super admin) blocks system words and bank or brand names.

## Tenant sign-up
- Open. Fields: business name, address, your name, email, password (15+), terms tick. Live after the emailed link is used. Same answer for an email that already has an account.
- Super admin can suspend: pages say "unavailable", admin sign-in blocked, nothing deleted.

## Registration page
- Fixed fields: full name, email, mobile (PH), city, consent tick (starts unticked). One registration per email per tenant; a repeat looks identical. Same person may register with other tenants.
- Standard privacy notice with the tenant's name.

## Tenant admin (CRM look)
- Registrations: search, CSV export, delete one record. Exports and deletions are logged.
- Site editor with live preview, save is live at once. Account: name, password, activity log.

## Super admin (CRM look)
- Tenant list, suspend/reactivate, change address, rename, edit any tenant's branding. Registrations only through a logged, reasoned, one-hour grant that the tenant can see. Reserved list. Audit log. Second factor required.

## Public pages (Sky look, light only)
- Built from Sky bands: nav, hero, feature cards, join panel, FAQ, contact band, footer card. Each of features, join, FAQ and contact can be switched off.
- Editable: logo, favicon, one brand colour (auto-darkened when white text would be unreadable), hero headline/text/image, contact details, social links, footer blurb, page title and description.
- Neutral starting copy that is true for any business. "Site by Gentrep" in the footer.

## Stack
Next.js 16 + Elysia API in one repo (Bun, TypeScript, Tailwind v4). Supabase: tenant id on every table, RLS, SQL functions for every write. Login per address (host-only cookies). Resend for the two emails (sign-up link, password reset). Trap field and per-visitor limits on public forms. Images in a public-read bucket (2 MB, png/jpeg/webp, generated names, own folder only).

## Left out on purpose
Products, orders, payouts, referral codes, registrant logins, SMS, notification emails, custom form fields, extra staff per tenant, self-service site deletion, per-tenant fonts, dark public pages, draft-and-publish, custom domains.

Also left for the second pass (differs from the first sketch): the quote grid and the partner-logo grid. They have no honest placeholder (invented testimonials mislead people), so they arrive together with the list editors.

## Playbook rules applied that changed the sketch
- Super admin does not see registrations by default (11 - Multi-Tenant Pattern): a reasoned, one-hour, logged grant, visible to the tenant.
- Tenant creation happens when the emailed link is used (`activate_my_tenant`), not at sign-up, so unconfirmed sign-ups hold no address.
- Super admin needs a second factor; tenant admins do not (yet). No MFA screens for tenant admins in v1.
- A fifth public route exists: password-reset request.
