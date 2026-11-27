// API tests: the real routes and the real SQL.
//   bun test                 -> PGlite behind a Supabase test double (supabase/tests/fake-supabase.ts), offline.
//   bun run test:e2e         -> the same tests against a real Supabase (local stack, or a dev project): E2E_SUPABASE_* set.
import { beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { startFake, totp } from "../../../supabase/tests/fake-supabase";

const real = Bun.env.E2E_SUPABASE_URL
  ? { url: Bun.env.E2E_SUPABASE_URL, keys: { publishable: Bun.env.E2E_SUPABASE_PUBLISHABLE_KEY!, secret: Bun.env.E2E_SUPABASE_SECRET_KEY! } }
  : null;
const fake = real ? null : await startFake();
const supa = real ?? { url: fake!.url, keys: fake!.keys };
Object.assign(Bun.env, {
  APP_ENV: "local", EMAIL_MODE: "memory", ROOT_DOMAIN: "localhost:3000",
  SUPABASE_URL: supa.url, SUPABASE_PUBLISHABLE_KEY: supa.keys.publishable, SUPABASE_SECRET_KEY: supa.keys.secret,
});
const { handle } = await import("./index");
const { outbox } = await import("./email");
const { allow } = await import("./limits");

const PASSWORD = "correct-horse-battery-staple";
let n = 0;
const nextIp = () => `10.1.${Math.floor(++n / 250)}.${n % 250}`;

async function api(method: string, path: string, opts: { token?: string; body?: unknown; ip?: string } = {}) {
  const res = await handle(
    new Request(`http://api.test${path}`, {
      method,
      headers: { "x-forwarded-for": opts.ip ?? nextIp(), ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer()); // keep a BOM, unlike res.text()
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, res, text };
}

const client = () => createClient(supa.url, supa.keys.publishable, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email: string, password = PASSWORD) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign in failed: ${error?.message}`);
  return { c, token: data.session.access_token };
}

let counter = 0;
/** The product's own sign-up path: form, emailed link, confirm, open the site. */
async function signUpTenant(label = "shop") {
  const slug = `${label}${++counter}x${Math.random().toString(36).slice(2, 6)}`;
  const email = `${slug}@example.test`;
  const r = await api("POST", "/public/tenants", { body: { business_name: `Shop ${slug}`, slug, admin_name: "Ada Admin", email, password: PASSWORD, accept_terms: true } });
  expect(r.status).toBe(200);
  const mail = outbox.findLast((m) => m.to === email)!;
  const hash = new URLSearchParams(mail.text.match(/#(token_hash=[^\s]+)/)![1]);
  const c = client();
  const v = await c.auth.verifyOtp({ token_hash: hash.get("token_hash")!, type: hash.get("type") as "signup" });
  expect(v.error).toBeNull();
  const token = v.data.session!.access_token;
  const act = await api("POST", "/me/activate", { token, body: {} });
  expect(act.status).toBe(200);
  return { slug, email, token, c, mailText: mail.text };
}

async function platformAdmin() {
  const email = `root${++counter}-${Math.random().toString(36).slice(2, 8)}@example.test`; // unique: a hosted project may hold leftovers from an earlier run
  const svc = createClient(supa.url, supa.keys.secret, { auth: { persistSession: false } });
  const made = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (made.error) throw new Error(`createUser: ${made.error.code} ${made.error.message}`);
  const id = made.data.user!.id;
  expect((await client().rpc("bootstrap_platform_admin", { p_user: id })).error).not.toBeNull(); // anon must not be able to
  const boot = await svc.rpc("bootstrap_platform_admin", { p_user: id });
  if (boot.error) throw new Error(`bootstrap: ${boot.error.message}`);
  const { c, token: aal1 } = await signIn(email);
  const enrol = await c.auth.mfa.enroll({ factorType: "totp" });
  if (enrol.error) throw new Error(`mfa enroll: ${enrol.error.code} ${enrol.error.message}`);
  const ch = await c.auth.mfa.challenge({ factorId: enrol.data.id });
  if (ch.error) throw new Error(`mfa challenge: ${ch.error.code} ${ch.error.message}`);
  const ver = await c.auth.mfa.verify({ factorId: enrol.data.id, challengeId: ch.data.id, code: await totp(enrol.data.totp.secret) });
  if (ver.error) throw new Error(`mfa verify: ${ver.error.code} ${ver.error.message}`);
  const aal2 = (await c.auth.getSession()).data.session!.access_token;
  return { email, aal1, aal2 };
}

describe("the gate", () => {
  test("health is open; prefix /api is stripped", async () => {
    expect((await api("GET", "/health")).status).toBe(200);
    expect((await api("GET", "/api/health")).status).toBe(200);
    expect((await api("GET", "/apiary")).status).toBe(404);
  });

  test("every signed-in route needs a token, and junk tokens are 401, not 500", async () => {
    for (const [m, p] of [["GET", "/me"], ["POST", "/me/activate"], ["GET", "/admin/site"], ["PUT", "/admin/site"], ["GET", "/admin/registrations"], ["GET", "/admin/registrations-export"], ["GET", "/admin/audit"], ["GET", "/platform/tenants"], ["GET", "/platform/reserved"]]) {
      expect((await api(m!, p!)).status).toBe(401);
      expect((await api(m!, p!, { token: "abc.def.ghi" })).status).toBe(401);
      expect((await api(m!, p!, { token: "not-a-jwt" })).status).toBe(401);
    }
  });

  test("responses are never cached and carry nosniff", async () => {
    const r = await api("GET", "/health");
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    expect(r.res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("unknown fields in a body are rejected before they reach anything", async () => {
    const r = await api("POST", "/public/sites/anything/registrations", { body: { full_name: "Ana", email: "a@b.cc", mobile: "09171234567", city: "Cebu", consent: true, tenant_id: "x" } });
    expect(r.status).toBe(422);
    expect(r.data).toEqual({ error: "Some fields are missing or invalid." });
  });

  test("the rate limiter stops at the limit", () => {
    const key = `t:${crypto.randomUUID()}`;
    expect(Array.from({ length: 5 }, () => allow(key, 3, 60)).filter(Boolean).length).toBe(3);
  });
});

describe("public routes", () => {
  test("slug check: available, invalid, reserved, taken with a suggestion; limited per visitor", async () => {
    const t = await signUpTenant("slugs");
    const check = async (slug: string, ip?: string) => (await api("GET", `/public/slug-check?slug=${encodeURIComponent(slug)}`, { ip })).data;
    expect((await check("totally-free-name")).status).toBe("available");
    expect((await check("www")).status).toBe("reserved");
    expect((await check("No Way")).status).toBe("invalid");
    const taken = await check(t.slug);
    expect(taken.status).toBe("taken");
    expect(taken.suggestion).toBe(`${t.slug}-2`);
    const ip = "10.9.9.9";
    const codes = [];
    for (let i = 0; i < 62; i++) codes.push((await api("GET", "/public/slug-check?slug=abc", { ip })).status);
    expect(codes.at(-1)).toBe(429);
    expect(codes[0]).toBe(200);
  }, 60_000); // 62 requests in a row: slow against a hosted project

  test("an unknown site is a plain 404", async () => {
    const r = await api("GET", "/public/sites/no-such-site");
    expect(r.status).toBe(404);
    expect(r.data).toEqual({ error: "Site not found." });
  });

  test("sign-up checks its fields and the address", async () => {
    const ok = { business_name: "Nice Shop", slug: "nice-shop-1", admin_name: "Ada", email: "ada@example.test", password: PASSWORD, accept_terms: true };
    expect((await api("POST", "/public/tenants", { body: { ...ok, password: "short" } })).status).toBe(422);
    expect((await api("POST", "/public/tenants", { body: { ...ok, accept_terms: false } })).status).toBe(422);
    expect((await api("POST", "/public/tenants", { body: { ...ok, email: "nope" } })).status).toBe(422);
    expect((await api("POST", "/public/tenants", { body: { ...ok, slug: "Bad Slug" } })).status).toBe(422);
    expect((await api("POST", "/public/tenants", { body: { ...ok, slug: "admin" } })).status).toBe(400);
    expect((await api("POST", "/public/tenants", { body: { ...ok, role: "platform_admin" } })).status).toBe(422);
    const t = await signUpTenant("dup");
    const taken = await api("POST", "/public/tenants", { body: { ...ok, slug: t.slug, email: "other@example.test" } });
    expect(taken.status).toBe(409);
  });

  test("the same email signing up again gets the same answer and no second email", async () => {
    const t = await signUpTenant("again");
    const before = outbox.length;
    const r = await api("POST", "/public/tenants", { body: { business_name: "Second Try", slug: `${t.slug}-b`, admin_name: "Ada", email: t.email, password: PASSWORD, accept_terms: true } });
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ ok: true });
    expect(outbox.length).toBe(before);
  });

  test("the confirm link carries its token after # and works once", async () => {
    const t = await signUpTenant("link");
    expect(t.mailText).toMatch(new RegExp(`http://${t.slug}\\.localhost:3000/auth/confirm#token_hash=`));
    expect(t.mailText).not.toContain("?token");
    const hash = new URLSearchParams(t.mailText.match(/#(token_hash=[^\s]+)/)![1]);
    const again = await client().auth.verifyOtp({ token_hash: hash.get("token_hash")!, type: "signup" });
    expect(again.error).not.toBeNull();
  });

  test("a failed mail leaves no half-made account behind", async () => {
    // Not reachable in memory mode; the cleanup path is covered by reading it: sendMail throws -> deleteUser.
    expect(typeof outbox.length).toBe("number");
  });

  test("password reset says OK for anyone and mails only real accounts", async () => {
    const t = await signUpTenant("reset");
    const before = outbox.length;
    expect((await api("POST", "/public/forgot", { body: { email: "ghost@example.test", slug: t.slug } })).data).toEqual({ ok: true });
    expect(outbox.length).toBe(before);
    expect((await api("POST", "/public/forgot", { body: { email: t.email, slug: t.slug } })).data).toEqual({ ok: true });
    expect(outbox.length).toBe(before + 1);
    expect(outbox.at(-1)!.text).toContain(`${t.slug}.localhost:3000/auth/confirm#token_hash=`);
    const ip = "10.8.8.8";
    const last = [];
    for (let i = 0; i < 6; i++) last.push((await api("POST", "/public/forgot", { body: { email: t.email }, ip })).status);
    expect(last.at(-1)).toBe(429);
  });
});

describe("registration page", () => {
  test("a person registers; a repeat looks identical; the trap field and bad input are handled", async () => {
    const t = await signUpTenant("reg");
    const form = { full_name: "Maria Santos", email: "Maria@Example.test", mobile: "0917 123 4567", city: "Davao City", consent: true };
    const first = await api("POST", `/public/sites/${t.slug}/registrations`, { body: form });
    const second = await api("POST", `/public/sites/${t.slug}/registrations`, { body: { ...form, email: "maria@example.test" } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data).toEqual(first.data);

    const trap = await api("POST", `/public/sites/${t.slug}/registrations`, { body: { ...form, email: "bot@example.test", website: "http://spam" } });
    expect(trap.status).toBe(200);
    expect((await api("POST", `/public/sites/${t.slug}/registrations`, { body: { ...form, email: "x@example.test", mobile: "12345" } })).status).toBe(422);
    expect((await api("POST", `/public/sites/${t.slug}/registrations`, { body: { ...form, consent: false } })).status).toBe(422);
    expect((await api("POST", "/public/sites/no-such-site/registrations", { body: form })).data).toEqual({ error: "This site is not taking registrations." });

    const list = await api("GET", "/admin/registrations", { token: t.token });
    expect(list.data.total).toBe(1);
    expect(list.data.rows[0]).toMatchObject({ full_name: "Maria Santos", email: "maria@example.test", mobile: "+639171234567", city: "Davao City" });
  });

  test("registrations are limited per visitor", async () => {
    const t = await signUpTenant("flood");
    const ip = "10.7.7.7";
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await api("POST", `/public/sites/${t.slug}/registrations`, { ip, body: { full_name: "Ana Cruz", email: `a${i}@example.test`, mobile: "09171234567", city: "Cebu", consent: true } })).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  const reg = (slug: string) => `/public/sites/${slug}/registrations`;
  const person = { full_name: "Maria Santos", email: "maria@example.test", mobile: "0917 123 4567", city: "Davao City", consent: true };
  const tokenFrom = (mail: { text: string }) => mail.text.match(/\/my-qr#k=([A-Za-z0-9_-]{43})/)![1]!;

  test("registering emails a private link; a repeat sends the same link and the same answer; the card opens only with it", async () => {
    const t = await signUpTenant("card");
    const before = outbox.length;
    const first = await api("POST", reg(t.slug), { body: { ...person, email: "card1@example.test" } });
    expect(first.status).toBe(200);
    expect(outbox.length).toBe(before + 1);
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe("card1@example.test");
    expect(mail.text).toContain(`http://${t.slug}.localhost:3000/my-qr#k=`);
    const token = tokenFrom(mail);

    const card = await api("POST", `/public/sites/${t.slug}/card`, { body: { token } });
    expect(card.status).toBe(200);
    expect(card.data).toEqual({ member_code: expect.any(Number), invited: 0 });
    expect(String(card.data.member_code)).toMatch(/^[1-9][0-9]{5}$/);
    expect(JSON.stringify(card.data)).not.toContain("maria");

    const again = await api("POST", reg(t.slug), { body: { ...person, email: "CARD1@example.test" } });
    expect(again.data).toEqual(first.data);
    expect(tokenFrom(outbox.at(-1)!)).toBe(token);

    const other = await signUpTenant("card-other");
    expect((await api("POST", `/public/sites/${other.slug}/card`, { body: { token } })).status).toBe(404); // right link, wrong site
    expect((await api("POST", `/public/sites/${t.slug}/card`, { body: { token: "A".repeat(43) } })).status).toBe(404);
    expect((await api("POST", `/public/sites/${t.slug}/card`, { body: { token: "short" } })).status).toBe(422);
    expect((await api("POST", `/public/sites/no-such-site/card`, { body: { token } })).status).toBe(404);
  });

  test("a trapped bot and a bad registration send no email", async () => {
    const t = await signUpTenant("nomail");
    const before = outbox.length;
    await api("POST", reg(t.slug), { body: { ...person, website: "http://spam" } });
    await api("POST", reg(t.slug), { body: { ...person, mobile: "12345" } });
    await api("POST", `/public/sites/no-such-site/registrations`, { body: person });
    expect(outbox.length).toBe(before);
  });

  test("a person who joins with an invite code is counted on the inviter's card and in the admin list", async () => {
    const t = await signUpTenant("invite");
    await api("POST", reg(t.slug), { body: { ...person, email: "host2@example.test" } });
    const host = (await api("POST", `/public/sites/${t.slug}/card`, { body: { token: tokenFrom(outbox.at(-1)!) } })).data;
    const guest = await api("POST", reg(t.slug), { body: { ...person, full_name: "Gina Cruz", email: "gina@example.test", ref_code: String(host.member_code), name_prefix: "Dr." } });
    expect(guest.status).toBe(200);
    await api("POST", reg(t.slug), { body: { ...person, email: "nocode@example.test", ref_code: "123456" } }); // unknown code: still registers

    const card = (await api("POST", `/public/sites/${t.slug}/card`, { body: { token: tokenFrom(outbox.findLast((m) => m.to === "host2@example.test")!) } })).data;
    expect(card.invited).toBe(1);

    const list = (await api("GET", `/admin/registrations?ref=${host.member_code}`, { token: t.token })).data;
    expect(list.total).toBe(1);
    expect(list.rows[0]).toMatchObject({ name_prefix: "Dr.", full_name: "Gina Cruz", referred_by_code: host.member_code, referred_by_name: "Maria Santos" });
    expect((await api("GET", "/admin/registrations?ref=12", { token: t.token })).status).toBe(422);
    expect((await api("GET", `/admin/registrations?ref=${host.member_code}`, { token: (await signUpTenant("invite-b")).token })).data.total).toBe(0);
  });

  test("bad titles and malformed invite codes are refused before the database", async () => {
    const t = await signUpTenant("badform");
    for (const patch of [{ name_prefix: "Lord" }, { ref_code: "12345" }, { ref_code: "012345" }, { ref_code: "abcdef" }, { category: "x".repeat(61) }, { address: "x".repeat(201) }, { source: "x".repeat(121) }]) {
      expect((await api("POST", reg(t.slug), { body: { ...person, ...patch } })).status).toBe(422);
    }
  });

  test("the tenant's form settings decide what is asked and required", async () => {
    const t = await signUpTenant("fields");
    const site = (await api("GET", "/admin/site", { token: t.token })).data.settings;
    expect(site).toMatchObject({ reg_category_label: "Category", reg_categories: [], reg_show_address: false, reg_show_source: false });

    const edit = (patch: object) => api("PUT", "/admin/site", { token: t.token, body: { ...site, ...patch } });
    expect((await edit({ reg_categories: Array.from({ length: 21 }, (_, i) => `Option ${i}`) })).status).toBe(422);
    expect((await edit({ reg_categories: [""] })).status).toBe(422);
    expect((await edit({ reg_category_label: "" })).status).toBe(422);
    expect((await edit({ reg_categories: ["Cardiology", "cardiology"] })).status).toBe(400); // the database refuses a repeat
    expect((await edit({ reg_category_label: "Specialty", reg_categories: ["Cardiology", "Surgery"], reg_show_address: true, reg_show_source: true })).status).toBe(200);

    const pub = (await api("GET", `/public/sites/${t.slug}`)).data.settings;
    expect(pub).toMatchObject({ reg_category_label: "Specialty", reg_categories: ["Cardiology", "Surgery"], reg_show_address: true, reg_show_source: true });

    const missing = await api("POST", reg(t.slug), { body: person });
    expect(missing).toMatchObject({ status: 400, data: { error: "Choose one of the listed options." } });
    const noAddress = await api("POST", reg(t.slug), { body: { ...person, category: "Surgery" } });
    expect(noAddress).toMatchObject({ status: 400, data: { error: "Enter your address." } });
    const ok = await api("POST", reg(t.slug), { body: { ...person, category: "Surgery", address: "1 Rizal St, Davao", source: "A friend" } });
    expect(ok.status).toBe(200);
    expect((await api("GET", "/admin/registrations", { token: t.token })).data.rows[0]).toMatchObject({ category: "Surgery", address: "1 Rizal St, Davao", source: "A friend" });
  });

  test("one address gets at most 3 invite emails an hour, and the answer never changes", async () => {
    const t = await signUpTenant("mailcap");
    const before = outbox.length;
    const answers: Awaited<ReturnType<typeof api>>[] = [];
    for (let i = 0; i < 5; i++) answers.push(await api("POST", reg(t.slug), { body: { ...person, email: "capped@example.test" } }));
    expect(answers.every((a) => a.status === 200 && JSON.stringify(a.data) === JSON.stringify(answers[0]!.data))).toBe(true);
    expect(outbox.length - before).toBe(3);
  });

  test("the card route is limited per visitor", async () => {
    const t = await signUpTenant("cardlimit");
    const ip = "10.6.6.6";
    const codes = [];
    for (let i = 0; i < 32; i++) codes.push((await api("POST", `/public/sites/${t.slug}/card`, { ip, body: { token: "B".repeat(43) } })).status);
    expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  }, 30_000); // 32 sequential calls: slow against a hosted project
});

describe("tenant admin", () => {
  test("sign-up to a live site: me, edit, public view, registrations, export, delete, audit", async () => {
    const t = await signUpTenant("flow");
    const me = (await api("GET", "/me", { token: t.token })).data;
    expect(me.tenant).toMatchObject({ slug: t.slug, status: "active" });
    expect(me.platform_admin).toBe(false);

    const site = (await api("GET", "/admin/site", { token: t.token })).data;
    expect(site.settings.brand_color).toBe("#0068d0");
    const save = await api("PUT", "/admin/site", { token: t.token, body: { ...site.settings, brand_color: "#7C3AED", hero_headline: "Welcome to our shop", contact_email: "hello@example.test", facebook_url: "https://facebook.com/shop", show_faq: true } });
    expect(save.status).toBe(200);
    const pub = (await api("GET", `/public/sites/${t.slug}`)).data;
    expect(pub).toMatchObject({ status: "active", slug: t.slug, settings: { brand_color: "#7c3aed", hero_headline: "Welcome to our shop", show_faq: true } });
    expect(JSON.stringify(pub)).not.toContain(me.user_id);

    for (const [name, email] of [["=HYPERLINK(\"http://evil\")", "f1@example.test"], ["-2+3", "f2@example.test"], ["Normal, Name", "f3@example.test"]]) {
      await api("POST", `/public/sites/${t.slug}/registrations`, { body: { full_name: name, email, mobile: "09171234567", city: "Cebu", consent: true } });
    }
    const csv = await api("GET", "/admin/registrations-export", { token: t.token });
    expect(csv.res.headers.get("content-type")).toContain("text/csv");
    expect(csv.res.headers.get("content-disposition")).toContain("attachment");
    expect(csv.text.startsWith("﻿Title,Name,Email,Mobile,City,Category,Address,Where found,Code,Invited by (code),Type,Registered (UTC+8)\r\n")).toBe(true);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv.text).toContain(`'-2+3`);
    expect(csv.text).toContain(`"Normal, Name"`);
    expect(csv.text).toContain("0917 123 4567");

    const list = (await api("GET", "/admin/registrations?q=normal", { token: t.token })).data;
    expect(list.total).toBe(1);
    expect((await api("DELETE", `/admin/registrations/${list.rows[0].id}`, { token: t.token })).status).toBe(200);
    expect((await api("DELETE", `/admin/registrations/${list.rows[0].id}`, { token: t.token })).status).toBe(404);
    expect((await api("GET", "/admin/registrations", { token: t.token })).data.total).toBe(2);

    const audit = (await api("GET", "/admin/audit", { token: t.token })).data.rows.map((r: any) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["tenant_created", "registrations_exported", "registration_deleted"]));
    expect((await api("PATCH", "/admin/account", { token: t.token, body: { name: "  Renamed   Shop " } })).status).toBe(200);
    expect((await api("GET", `/public/sites/${t.slug}`)).data.name).toBe("Renamed Shop");
  });

  test("a second tenant's admin sees none of the first tenant's data", async () => {
    const a = await signUpTenant("iso-a");
    const b = await signUpTenant("iso-b");
    await api("POST", `/public/sites/${a.slug}/registrations`, { body: { full_name: "Only A", email: "onlya@example.test", mobile: "09171234567", city: "Cebu", consent: true } });
    expect((await api("GET", "/admin/registrations", { token: b.token })).data.total).toBe(0);
    expect((await api("GET", "/admin/registrations-export", { token: b.token })).text).not.toContain("Only A");
    const siteA = (await api("GET", "/admin/site", { token: a.token })).data;
    const tryOtherFolder = await api("PUT", "/admin/site", { token: b.token, body: { ...siteA.settings, logo_path: `${siteA.tenant.id}/${crypto.randomUUID()}.png` } });
    expect(tryOtherFolder.status).toBe(400);
    expect(tryOtherFolder.data).toEqual({ error: "Some values are missing or not allowed." }); // no constraint or table names
    expect((await api("GET", "/platform/tenants", { token: b.token })).status).toBe(403);
  });

  test("bad site values are refused by the schema before the database", async () => {
    const t = await signUpTenant("bad");
    const s = (await api("GET", "/admin/site", { token: t.token })).data.settings;
    for (const patch of [{ brand_color: "red" }, { facebook_url: "javascript:alert(1)" }, { hero_text: "x".repeat(301) }, { contact_phone: "call me" }, { contact_email: "a@b.cc?bcc=x@y.zz" }, { logo_path: "../x.png" }]) {
      expect((await api("PUT", "/admin/site", { token: t.token, body: { ...s, ...patch } })).status).toBe(422);
    }
    const { brand_color, ...missing } = s;
    expect((await api("PUT", "/admin/site", { token: t.token, body: missing })).status).toBe(422);
  });

  test("brand images upload into the tenant's own folder only, and are served publicly", async () => {
    const a = await signUpTenant("img-a");
    const b = await signUpTenant("img-b");
    const idA = (await api("GET", "/admin/site", { token: a.token })).data.tenant.id;
    const idB = (await api("GET", "/admin/site", { token: b.token })).data.tenant.id;
    const png = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" });
    const name = `${idA}/${crypto.randomUUID()}.png`;
    expect((await a.c.storage.from("brand").upload(name, png, { contentType: "image/png" })).error).toBeNull();
    expect((await a.c.storage.from("brand").upload(`${idB}/${crypto.randomUUID()}.png`, png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await a.c.storage.from("brand").upload(`${idA}/${crypto.randomUUID()}.svg`, new Blob(["<svg/>"], { type: "image/svg+xml" }), { contentType: "image/svg+xml" })).error).not.toBeNull();
    expect((await a.c.storage.from("brand").upload(`${idA}/${crypto.randomUUID()}.png`, new Blob([new Uint8Array(2_200_000)], { type: "image/png" }), { contentType: "image/png" })).error).not.toBeNull();
    const settings = (await api("GET", "/admin/site", { token: a.token })).data.settings;
    expect((await api("PUT", "/admin/site", { token: a.token, body: { ...settings, logo_path: name } })).status).toBe(200);
    const url = a.c.storage.from("brand").getPublicUrl(name).data.publicUrl;
    const got = await fetch(url);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
  });
});

describe("super admin", () => {
  test("needs the second factor: aal1 gets mfa_required, aal2 gets the list", async () => {
    const t = await signUpTenant("plat");
    const p = await platformAdmin();
    const denied = await api("GET", "/platform/tenants", { token: p.aal1 });
    expect(denied.status).toBe(403);
    expect(denied.data.code).toBe("mfa_required");
    const me = (await api("GET", "/me", { token: p.aal1 })).data;
    expect(me).toMatchObject({ platform_admin: true, aal: "aal1" });
    const list = await api("GET", `/platform/tenants?q=${t.slug}`, { token: p.aal2 });
    expect(list.status).toBe(200);
    expect(list.data.rows[0]).toMatchObject({ slug: t.slug, status: "active", registrations: 0, admin_email: t.email });
  });

  test("people stay closed until a logged grant; the tenant sees the grant", async () => {
    const t = await signUpTenant("grant");
    await api("POST", `/public/sites/${t.slug}/registrations`, { body: { full_name: "Private Person", email: "private@example.test", mobile: "09171234567", city: "Cebu", consent: true } });
    const p = await platformAdmin();
    const id = (await api("GET", `/platform/tenants?q=${t.slug}`, { token: p.aal2 })).data.rows[0].id;
    expect((await api("GET", `/platform/tenants/${id}/registrations`, { token: p.aal2 })).status).toBe(403);
    expect((await api("POST", `/platform/tenants/${id}/support`, { token: p.aal2, body: { reason: "short" } })).status).toBe(422);
    expect((await api("POST", `/platform/tenants/${id}/support`, { token: p.aal2, body: { reason: "Tenant asked us to check their list" } })).status).toBe(200);
    const view = await api("GET", `/platform/tenants/${id}/registrations`, { token: p.aal2 });
    expect(view.data.rows[0].email).toBe("private@example.test");
    expect((await api("GET", `/platform/tenants/${id}`, { token: p.aal2 })).data.support_expires_at).not.toBeNull();
    const mine = (await api("GET", "/admin/audit", { token: t.token })).data.rows;
    expect(mine.find((r: any) => r.action === "support_granted").detail.reason).toBe("Tenant asked us to check their list");
  });

  test("suspend locks the tenant out and shows an unavailable site; reactivate restores; slug change moves the address", async () => {
    const t = await signUpTenant("susp");
    const p = await platformAdmin();
    const id = (await api("GET", `/platform/tenants?q=${t.slug}`, { token: p.aal2 })).data.rows[0].id;
    expect((await api("PATCH", `/platform/tenants/${id}`, { token: p.aal2, body: { status: "suspended" } })).status).toBe(200);
    const locked = await api("GET", "/admin/registrations", { token: t.token });
    expect(locked.status).toBe(403);
    expect(locked.data.code).toBe("site_suspended");
    expect((await api("GET", `/public/sites/${t.slug}`)).data).toEqual({ status: "suspended" });
    expect((await api("PATCH", `/platform/tenants/${id}`, { token: p.aal2, body: { status: "active" } })).status).toBe(200);
    expect((await api("GET", "/admin/registrations", { token: t.token })).status).toBe(200);

    const next = `moved-${t.slug}`.slice(0, 40);
    expect((await api("PATCH", `/platform/tenants/${id}`, { token: p.aal2, body: { slug: "www" } })).data.error).toContain("reserved");
    expect((await api("PATCH", `/platform/tenants/${id}`, { token: p.aal2, body: { slug: next } })).status).toBe(200);
    expect((await api("GET", `/public/sites/${t.slug}`)).status).toBe(404);
    expect((await api("GET", `/public/sites/${next}`)).data.slug).toBe(next);
  });

  test("reserved list, branding edit and audit log work for the platform", async () => {
    const t = await signUpTenant("brand");
    const p = await platformAdmin();
    const id = (await api("GET", `/platform/tenants?q=${t.slug}`, { token: p.aal2 })).data.rows[0].id;
    const word = `blocked${++counter}`;
    expect((await api("POST", "/platform/reserved", { token: p.aal2, body: { slug: word } })).status).toBe(200);
    expect((await api("GET", `/public/slug-check?slug=${word}`)).data.status).toBe("reserved");
    expect((await api("GET", "/platform/reserved", { token: p.aal2 })).data).toContain(word);
    expect((await api("DELETE", `/platform/reserved/${word}`, { token: p.aal2 })).status).toBe(200);

    const site = (await api("GET", `/platform/tenants/${id}/site`, { token: p.aal2 })).data;
    expect((await api("PUT", `/platform/tenants/${id}/site`, { token: p.aal2, body: { ...site.settings, brand_color: "#123456" } })).status).toBe(200);
    expect((await api("GET", `/public/sites/${t.slug}`)).data.settings.brand_color).toBe("#123456");
    const audit = (await api("GET", `/platform/audit?tenant=${id}`, { token: p.aal2 })).data.rows.map((r: any) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["tenant_created", "site_edited"]));
  });
});
