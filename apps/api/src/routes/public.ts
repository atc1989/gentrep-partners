import { Elysia, status, t } from "elysia";
import { anon, must, serviceClient } from "../db";
import { confirmMail, memberMail, resetMail, sendMail } from "../email";
import { siteOrigin } from "../env";
import { allow, clientIp } from "../limits";
import { TOKEN_RE, hashToken, memberToken } from "../member";
import { Body, EmailField, Maybe, MemberFields, Password, SlugParam, Text } from "../schema";
import { NOTICE_VERSION, cleanText, isSlug, normalizeMobile, type MemberCard, type PublicSite, type SlugCheck } from "../shared";

// The public routes: no sign-in, so each has its own per-visitor limit. Exactly these and nothing else are open
// (playbook: 02 - Auth and Roles, "API auth gate"; round-4 decision): site lookup, slug check, tenant sign-up,
// registration, the member card behind a private link, and password-reset request.

const OK = { ok: true } as const;

function limit(headers: Record<string, string | undefined>, name: string, max: number, seconds: number) {
  if (!allow(`${name}:${clientIp(headers)}`, max, seconds)) throw status(429, { error: "Too many tries. Wait a moment and try again." });
}

const linkFor = (slug: string | null, tokenHash: string, type: string) =>
  `${siteOrigin(slug)}/auth/confirm#token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`;

export const publicRoutes = new Elysia({ prefix: "/public" })
  // The landing page, the registration page and the editor preview all read this.
  .get(
    "/sites/:slug",
    async ({ params }) => {
      const site = must<PublicSite | null>(await anon.rpc("get_site", { p_slug: params.slug }));
      if (!site) throw status(404, { error: "Site not found." });
      return site;
    },
    { params: t.Object({ slug: SlugParam }) },
  )

  .get(
    "/slug-check",
    async ({ query, headers }) => {
      limit(headers, "slug", 60, 60);
      const state = must<SlugCheck["status"]>(await anon.rpc("slug_status", { p_slug: query.slug }));
      let suggestion: string | null = null;
      if (state === "taken") {
        for (let i = 2; i <= 6 && !suggestion; i++) {
          const candidate = `${query.slug.slice(0, 37)}-${i}`;
          if (must<string>(await anon.rpc("slug_status", { p_slug: candidate })) === "available") suggestion = candidate;
        }
      }
      return { slug: query.slug, status: state, suggestion } satisfies SlugCheck;
    },
    { query: t.Object({ slug: t.String({ maxLength: 60 }) }) },
  )

  // Creates the sign-in account and parks the wanted name and address in app_metadata (only the service role can
  // write it). The site itself opens when the emailed link is used: public.activate_my_tenant.
  .post(
    "/tenants",
    async ({ body, headers }) => {
      limit(headers, "signup", 10, 3600);
      const name = cleanText(body.business_name);
      const adminName = cleanText(body.admin_name);
      if (name.length < 2 || adminName.length < 2) throw status(422, { error: "Enter your business name and your name." });
      if (!isSlug(body.slug)) throw status(422, { error: "Use 3 to 40 letters, numbers or hyphens for the address." });
      const state = must<SlugCheck["status"]>(await anon.rpc("slug_status", { p_slug: body.slug }));
      if (state === "reserved") throw status(400, { error: "That address is not available. Choose another." });
      if (state === "taken") throw status(409, { error: "That address is taken. Choose another." });

      const email = body.email.trim().toLowerCase();
      const svc = serviceClient();
      const created = await svc.auth.admin.generateLink({ type: "signup", email, password: body.password });
      if (created.error || !created.data.user || !created.data.properties) {
        // Same answer for an email that already has an account, so this form cannot be used to find who has one.
        if (/already|registered|exists/i.test(created.error?.message ?? "")) return OK;
        console.error("generateLink failed", created.error?.status, created.error?.code);
        throw status(500, { error: "Something went wrong. Try again." });
      }
      const { user, properties } = created.data;
      const pending = await svc.auth.admin.updateUserById(user.id, { app_metadata: { pending_tenant: { slug: body.slug, name, admin_name: adminName } } });
      if (pending.error) {
        await svc.auth.admin.deleteUser(user.id);
        throw status(500, { error: "Something went wrong. Try again." });
      }
      try {
        await sendMail(confirmMail(email, name, linkFor(body.slug, properties.hashed_token, properties.verification_type)));
      } catch {
        await svc.auth.admin.deleteUser(user.id); // so a retry is a clean start, not a silent "already registered"
        throw status(502, { error: "We could not send the email. Try again in a minute." });
      }
      return OK;
    },
    {
      body: Body({
        business_name: Text(80, 2),
        slug: t.String({ maxLength: 40 }),
        admin_name: Text(100, 2),
        email: EmailField,
        password: Password,
        accept_terms: t.Literal(true),
      }),
    },
  )

  // A duplicate email answers exactly like a new one (playbook: round-4 decision), and a trap field stops simple bots.
  // Every registration, new or repeat, gets the same email with the person's private invite link.
  .post(
    "/sites/:slug/registrations",
    async ({ params, body, headers }) => {
      limit(headers, "register", 10, 60);
      if (body.website) return OK;
      const mobile = normalizeMobile(body.mobile);
      if (!mobile) throw status(422, { error: "Enter a Philippine mobile number, like 0917 123 4567." });
      const email = body.email.trim().toLowerCase();
      const { token, hash } = await memberToken(email);
      const text = (v: string | null | undefined) => (v ? cleanText(v) : null);
      must(
        await anon.rpc("register_member", {
          p_slug: params.slug,
          p_member: {
            name_prefix: body.name_prefix ?? null,
            full_name: cleanText(body.full_name),
            email,
            mobile,
            city: cleanText(body.city),
            category: text(body.category),
            address: text(body.address),
            source: text(body.source),
            ref_code: body.ref_code ?? null,
            link_hash: hash,
          },
          p_notice_version: NOTICE_VERSION,
        }),
      );
      // The person is registered whether or not the email goes out; a failed send is logged by sendMail, not shown.
      // At most 3 a day-ish per address (an hour here): this form must not be a way to flood someone's inbox.
      if (allow(`member-mail:${email}`, 3, 3600)) {
        const site = (await anon.rpc("get_site", { p_slug: params.slug })).data as PublicSite | null;
        if (site?.status === "active") await sendMail(memberMail(email, site.name, `${siteOrigin(params.slug)}/my-qr#k=${token}`)).catch(() => {});
      }
      return OK;
    },
    {
      params: t.Object({ slug: SlugParam }),
      body: Body({
        full_name: Text(100, 2),
        email: EmailField,
        mobile: Text(30, 5),
        city: Text(80, 2),
        ...MemberFields,
        consent: t.Literal(true),
        website: t.Optional(t.String({ maxLength: 200 })),
      }),
    },
  )

  // A person opens their own invite page with the token from their email. The token is never stored: only its hash is.
  .post(
    "/sites/:slug/card",
    async ({ params, body, headers }) => {
      limit(headers, "card", 30, 60);
      const card = must<MemberCard | null>(await anon.rpc("get_member_card", { p_slug: params.slug, p_link_hash: await hashToken(body.token) }));
      if (!card) throw status(404, { error: "This link is not valid." });
      return card;
    },
    { params: t.Object({ slug: SlugParam }), body: Body({ token: t.String({ pattern: TOKEN_RE.source }) }) },
  )

  .post(
    "/forgot",
    async ({ body, headers }) => {
      limit(headers, "forgot", 5, 3600);
      const email = body.email.trim().toLowerCase();
      const link = await serviceClient().auth.admin.generateLink({ type: "recovery", email });
      if (!link.error && link.data.properties) {
        await sendMail(resetMail(email, linkFor(body.slug ?? null, link.data.properties.hashed_token, link.data.properties.verification_type))).catch(() => {});
      }
      return OK; // never says whether the email has an account
    },
    { body: Body({ email: EmailField, slug: t.Optional(Maybe(SlugParam)) }) },
  );
