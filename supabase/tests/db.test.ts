// Policy and function tests, run on the real migrations in PGlite. Offline: never touches a hosted project.
// Playbook: 11 - Multi-Tenant Pattern "Tests". Each test builds the tenants it needs and does not rely on order.
import { beforeAll, describe, expect, test } from "bun:test";
import { as, openDb, type Claims, type Db } from "./pglite";

let db: Db;
beforeAll(async () => {
  db = await openDb();
});

type Result = { rows: any[]; code?: string; message?: string };
async function run(role: "anon" | "authenticated" | "service_role", claims: Claims | null, sql: string, params: unknown[] = []): Promise<Result> {
  return as(db, role, claims, async () => {
    try {
      const r = await db.query(sql, params);
      return { rows: r.rows as any[] };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return { rows: [], code: err.code, message: err.message };
    }
  });
}
const root = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];
const rpc = (claims: Claims | null, fn: string, args: unknown[] = [], role: "anon" | "authenticated" | "service_role" = "authenticated") =>
  run(role, claims, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as v`, args);

let seq = 0;
const uniq = (p: string) => `${p}${++seq}${Math.random().toString(36).slice(2, 6)}`;

async function mkUser(opts: { confirmed?: boolean; pending?: { slug: string; name: string; admin_name?: string } } = {}) {
  const [u] = await root(
    `insert into auth.users (email, email_confirmed_at, raw_app_meta_data) values ($1, $2, $3) returning id`,
    [`${uniq("u")}@example.test`, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify(opts.pending ? { pending_tenant: { admin_name: "Ada Admin", ...opts.pending } } : {})],
  );
  return u.id as string;
}

/** A tenant made the way the product makes it: a confirmed user with pending metadata calls activate_my_tenant. */
async function mkTenant(slug = uniq("t")) {
  const user = await mkUser({ pending: { slug, name: `Shop ${slug}` } });
  const res = await rpc({ sub: user }, "activate_my_tenant");
  if (res.code) throw new Error(`mkTenant failed: ${res.message}`);
  const [t] = await root(`select id from public.tenants where slug = $1`, [slug]);
  return { slug, user, id: t.id as string, claims: { sub: user } as Claims };
}

async function register(slug: string, email = `${uniq("p")}@example.test`, mobile = "+639171234567") {
  return rpc(null, "register_member", [slug, "Maria Santos", email, mobile, "Davao City", "v1"], "anon");
}

async function mkPlatform() {
  const user = await mkUser();
  const r = await rpc(null, "bootstrap_platform_admin", [user], "service_role");
  if (r.code) throw new Error(r.message);
  return { user, aal1: { sub: user, aal: "aal1" } as Claims, aal2: { sub: user, aal: "aal2" } as Claims };
}

describe("structure", () => {
  test("every table has RLS on", async () => {
    const rows = await root(`select schemaname, tablename from pg_tables where schemaname in ('public', 'app') and not rowsecurity`);
    expect(rows).toEqual([]);
  });

  test("every public table carries tenant_id, except the two platform-wide ones", async () => {
    const rows = await root(`
      select t.table_name from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'tenant_id')
      order by 1`);
    expect(rows.map((r) => r.table_name)).toEqual(["reserved_slugs", "tenants"]);
  });

  test("anon can execute exactly three functions", async () => {
    const rows = await root(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute') order by 1`);
    expect(rows.map((r) => r.proname)).toEqual(["get_site", "register_member", "slug_status"]);
  });

  test("signed-in users cannot execute internal helpers", async () => {
    for (const fn of ["app.log(uuid, text, text, uuid, jsonb)", "app.slug_problem(text)", "app.require_platform()", "app.require_tenant()"]) {
      const [r] = await root(`select has_function_privilege('authenticated', '${fn}', 'execute') as ok`);
      expect(r.ok).toBe(false);
    }
    const [bootstrap] = await root(`select has_function_privilege('authenticated', 'public.bootstrap_platform_admin(uuid)', 'execute') as ok`);
    expect(bootstrap.ok).toBe(false);
  });

  test("anon reads no table and no client writes any table", async () => {
    const t = await mkTenant();
    for (const table of ["tenants", "tenant_admins", "site_settings", "registrations", "audit_log", "support_access", "reserved_slugs"]) {
      expect((await run("anon", null, `select * from public.${table}`)).code).toBe("42501");
    }
    const stmts = [
      `insert into public.tenants (slug, name) values ('hack', 'Hack')`,
      `update public.tenants set name = 'x'`,
      `delete from public.tenants`,
      `update public.site_settings set brand_color = '#000000'`,
      `insert into public.registrations (tenant_id, full_name, email, mobile, city, consent_notice_version) values ('${t.id}', 'Xx', 'a@b.cc', '+639171234567', 'Yy', 'v')`,
      `update public.registrations set tenant_id = '${t.id}'`,
      `delete from public.registrations`,
      `delete from public.audit_log`,
      `insert into public.audit_log (actor_kind, action) values ('system', 'forged')`,
      `insert into public.reserved_slugs (slug) values ('mine')`,
      `insert into public.tenant_admins (user_id, tenant_id, full_name) values ('${t.user}', '${t.id}', 'Nn')`,
      `insert into public.support_access (tenant_id, admin_id, reason, expires_at) values ('${t.id}', '${t.user}', 'long enough reason', now() + interval '1 day')`,
    ];
    for (const sql of stmts) expect((await run("authenticated", t.claims, sql)).code).toBe("42501");
  });
});

describe("tenant sign-up (activate_my_tenant)", () => {
  test("a confirmed user opens the site that was waiting; defaults exist; a log row is written", async () => {
    const t = await mkTenant();
    const [s] = await root(`select * from public.site_settings where tenant_id = $1`, [t.id]);
    expect(s.brand_color).toBe("#0068d0");
    expect(s.show_features).toBe(true);
    expect(s.show_faq).toBe(false);
    const log = await root(`select action, actor_kind from public.audit_log where tenant_id = $1`, [t.id]);
    expect(log).toEqual([{ action: "tenant_created", actor_kind: "tenant_admin" }]);
  });

  test("calling it twice returns the same site and makes nothing new", async () => {
    const t = await mkTenant();
    const again = await rpc(t.claims, "activate_my_tenant", ["some-other-slug"]);
    expect(again.rows[0].v).toEqual({ slug: t.slug });
    expect((await root(`select count(*)::int as n from public.tenants where id = $1`, [t.id]))[0].n).toBe(1);
  });

  test("an unconfirmed email cannot open a site", async () => {
    const user = await mkUser({ confirmed: false, pending: { slug: uniq("u"), name: "Nope Shop" } });
    const r = await rpc({ sub: user }, "activate_my_tenant");
    expect(r.code).toBe("42501");
  });

  test("a user with nothing waiting gets a plain message", async () => {
    const user = await mkUser();
    const r = await rpc({ sub: user }, "activate_my_tenant");
    expect(r.message).toContain("no site waiting");
  });

  test("a taken, reserved or malformed address is refused, and a new one can be chosen", async () => {
    const taken = await mkTenant();
    const user = await mkUser({ pending: { slug: taken.slug, name: "Late Shop" } });
    expect((await rpc({ sub: user }, "activate_my_tenant")).message).toContain("taken");
    expect((await rpc({ sub: user }, "activate_my_tenant", ["admin"])).message).toContain("not available");
    expect((await rpc({ sub: user }, "activate_my_tenant", ["A_B"])).message).toContain("3 to 40");
    expect((await rpc({ sub: user }, "activate_my_tenant", ["--ab"])).message).toContain("3 to 40");
    const ok = await rpc({ sub: user }, "activate_my_tenant", [uniq("fresh")]);
    expect(ok.code).toBeUndefined();
  });

  test("metadata a user writes themselves does not count (only app_metadata does)", async () => {
    const [u] = await root(`insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2) returning id`, [
      `${uniq("m")}@example.test`,
      JSON.stringify({ pending_tenant: { slug: uniq("evil"), name: "Evil Shop" } }),
    ]);
    const r = await rpc({ sub: u.id }, "activate_my_tenant");
    expect(r.message).toContain("no site waiting");
  });

  test("slug_status tells available, taken, reserved, invalid", async () => {
    const t = await mkTenant();
    const status = async (s: string) => (await rpc(null, "slug_status", [s], "anon")).rows[0].v;
    expect(await status(uniq("free"))).toBe("available");
    expect(await status(t.slug)).toBe("taken");
    expect(await status("www")).toBe("reserved");
    expect(await status("Bad Slug")).toBe("invalid");
    expect(await status("ab")).toBe("invalid");
  });

  test("whoami reports the tenant, the pending site and the sign-in level", async () => {
    const t = await mkTenant();
    const me = (await rpc(t.claims, "whoami")).rows[0].v;
    expect(me.tenant.slug).toBe(t.slug);
    expect(me.platform_admin).toBe(false);
    expect(me.aal).toBe("aal1");
    const waiting = await mkUser({ pending: { slug: uniq("w"), name: "Waiting Shop" } });
    expect((await rpc({ sub: waiting }, "whoami")).rows[0].v.pending.name).toBe("Waiting Shop");
    expect((await rpc(null, "whoami")).code).toBe("42501");
  });
});

describe("public pages (anon)", () => {
  test("get_site returns public settings only, nothing about people or admins", async () => {
    const t = await mkTenant();
    const v = (await rpc(null, "get_site", [t.slug], "anon")).rows[0].v;
    expect(v.status).toBe("active");
    expect(v.name).toBe(`Shop ${t.slug}`);
    expect(Object.keys(v.settings)).toContain("brand_color");
    expect(JSON.stringify(v)).not.toContain(t.user);
    expect((await rpc(null, "get_site", ["no-such-site"], "anon")).rows[0].v).toBeNull();
  });

  test("registering stores one row; a second try with the same email in any case adds nothing and says nothing", async () => {
    const t = await mkTenant();
    const email = `${uniq("dup")}@example.test`;
    expect((await register(t.slug, email)).code).toBeUndefined();
    expect((await register(t.slug, email.toUpperCase())).code).toBeUndefined();
    const rows = await root(`select email, mobile, consent_notice_version from public.registrations where tenant_id = $1`, [t.id]);
    expect(rows).toEqual([{ email, mobile: "+639171234567", consent_notice_version: "v1" }]);
  });

  test("the same person can register with two tenants, each sees only its own", async () => {
    const a = await mkTenant();
    const b = await mkTenant();
    const email = `${uniq("both")}@example.test`;
    await register(a.slug, email);
    await register(b.slug, email);
    expect((await root(`select count(*)::int as n from public.registrations where email = $1`, [email]))[0].n).toBe(2);
  });

  test("bad values are refused by the table itself", async () => {
    const t = await mkTenant();
    expect((await register(t.slug, "not-an-email")).code).toBe("23514");
    expect((await register(t.slug, `${uniq("x")}@example.test`, "0917")).code).toBe("23514");
    expect((await rpc(null, "register_member", [t.slug, "X", `${uniq("x")}@example.test`, "+639171234567", "Cebu", "v1"], "anon")).code).toBe("23514");
  });

  test("an unknown site, and a suspended one, refuse registrations", async () => {
    expect((await register("no-such-site")).message).toContain("not taking registrations");
    const t = await mkTenant();
    await root(`update public.tenants set status = 'suspended' where id = $1`, [t.id]);
    expect((await register(t.slug)).message).toContain("not taking registrations");
    expect((await rpc(null, "get_site", [t.slug], "anon")).rows[0].v).toEqual({ status: "suspended" });
  });

  test("a flood is capped per tenant per hour", async () => {
    const t = await mkTenant();
    await root(
      `insert into public.registrations (tenant_id, full_name, email, mobile, city, consent_notice_version)
       select $1, 'Flood Person', 'flood' || g || '@example.test', '+639171234567', 'Manila', 'v1' from generate_series(1, 500) g`,
      [t.id],
    );
    expect((await register(t.slug)).message).toContain("busy");
  });
});

describe("tenant isolation: tenant A's admin against tenant B", () => {
  let A: Awaited<ReturnType<typeof mkTenant>>, B: Awaited<ReturnType<typeof mkTenant>>;
  let aReg: string, bReg: string;
  beforeAll(async () => {
    A = await mkTenant();
    B = await mkTenant();
    await register(A.slug, "ann@example.test");
    await register(A.slug, "al@example.test");
    await register(B.slug, "bob@example.test");
    aReg = (await root(`select id from public.registrations where tenant_id = $1 and email = 'ann@example.test'`, [A.id]))[0].id;
    bReg = (await root(`select id from public.registrations where tenant_id = $1`, [B.id]))[0].id;
  });

  test("direct reads return only A's rows on every table", async () => {
    const cols: Record<string, string> = { registrations: "id, tenant_id, email" };
    const sel = async (t: string) => {
      const r = await run("authenticated", A.claims, `select ${cols[t] ?? "*"} from public.${t}`);
      expect(r.code).toBeUndefined();
      return r.rows;
    };
    expect((await sel("tenants")).map((r) => r.id)).toEqual([A.id]);
    expect((await sel("tenant_admins")).map((r) => r.tenant_id)).toEqual([A.id]);
    expect((await sel("site_settings")).map((r) => r.tenant_id)).toEqual([A.id]);
    expect((await sel("registrations")).every((r) => r.tenant_id === A.id)).toBe(true);
    expect((await sel("registrations")).length).toBe(2);
    expect((await sel("audit_log")).every((r) => r.tenant_id === A.id)).toBe(true);
    expect((await run("authenticated", A.claims, `select * from public.reserved_slugs`)).code).toBe("42501");
  });

  test("registrations has no read grant on columns outside the named list", async () => {
    const r = await run("authenticated", A.claims, `select tenant_id, email from public.registrations`);
    expect(r.code).toBeUndefined();
    const all = await run("authenticated", A.claims, `select consent_notice_version from public.registrations`);
    expect(all.code).toBe("42501");
  });

  test("listing: own rows by default, B by id is refused, search and paging work", async () => {
    const own = (await rpc(A.claims, "list_registrations")).rows[0].v;
    expect(own.total).toBe(2);
    expect(own.rows.map((r: any) => r.email).sort()).toEqual(["al@example.test", "ann@example.test"]);
    expect((await rpc(A.claims, "list_registrations", [B.id])).code).toBe("42501");
    const found = (await rpc(A.claims, "list_registrations", [null, "ann"])).rows[0].v;
    expect(found.rows.map((r: any) => r.email)).toEqual(["ann@example.test"]);
    expect((await rpc(A.claims, "list_registrations", [null, "%"])).rows[0].v.total).toBe(0); // wildcard is literal
    expect((await rpc(A.claims, "list_registrations", [null, null, 5])).rows[0].v.rows).toEqual([]);
  });

  test("deleting: B's row is not found and stays; own row goes and is logged without personal data", async () => {
    const miss = await rpc(A.claims, "delete_registration", [bReg]);
    expect(miss.code).toBe("GS404");
    expect((await root(`select count(*)::int as n from public.registrations where id = $1`, [bReg]))[0].n).toBe(1);
    const t = await mkTenant();
    await register(t.slug, "gone@example.test");
    const id = (await root(`select id from public.registrations where tenant_id = $1`, [t.id]))[0].id;
    expect((await rpc(t.claims, "delete_registration", [id])).code).toBeUndefined();
    const log = await root(`select action, target_id, detail from public.audit_log where tenant_id = $1 and action = 'registration_deleted'`, [t.id]);
    expect(log).toEqual([{ action: "registration_deleted", target_id: id, detail: {} }]);
    expect(JSON.stringify(log)).not.toContain("gone@example.test");
  });

  test("export returns only own rows and writes a log row with the count", async () => {
    const t = await mkTenant();
    await register(t.slug, "e1@example.test");
    await register(t.slug, "e2@example.test");
    const rows = (await rpc(t.claims, "export_registrations")).rows[0].v;
    expect(rows.length).toBe(2);
    expect(rows.every((r: any) => r.email.startsWith("e"))).toBe(true);
    const log = await root(`select detail from public.audit_log where tenant_id = $1 and action = 'registrations_exported'`, [t.id]);
    expect(log).toEqual([{ detail: { rows: 2 } }]);
  });

  test("site settings: own save works; B's is refused; foreign image paths and unsafe values are refused", async () => {
    const own = await rpc(A.claims, "save_site", [null, { brand_color: "#112233", hero_headline: "Hello there", show_faq: true, contact_phone: "+63 917 123 4567" }]);
    expect(own.code).toBeUndefined();
    const [s] = await root(`select brand_color, hero_headline, show_faq, show_features, contact_phone from public.site_settings where tenant_id = $1`, [A.id]);
    expect(s).toEqual({ brand_color: "#112233", hero_headline: "Hello there", show_faq: true, show_features: true, contact_phone: "+63 917 123 4567" });

    expect((await rpc(A.claims, "save_site", [B.id, { brand_color: "#000000" }])).code).toBe("42501");
    expect((await root(`select brand_color from public.site_settings where tenant_id = $1`, [B.id]))[0].brand_color).toBe("#0068d0");

    const uuid = crypto.randomUUID();
    expect((await rpc(A.claims, "save_site", [null, { logo_path: `${B.id}/${uuid}.png` }])).code).toBe("23514");
    expect((await rpc(A.claims, "save_site", [null, { logo_path: `${A.id}/${uuid}.png` }])).code).toBeUndefined();
    expect((await rpc(A.claims, "save_site", [null, { logo_path: `${A.id}/../${uuid}.png` }])).code).toBe("23514");
    expect((await rpc(A.claims, "save_site", [null, { brand_color: "red" }])).code).toBe("23514");
    expect((await rpc(A.claims, "save_site", [null, { facebook_url: "javascript:alert(1)" }])).code).toBe("23514");
    expect((await rpc(A.claims, "save_site", [null, { facebook_url: "https://facebook.com/shop" }])).code).toBeUndefined();
    expect((await rpc(A.claims, "save_site", [null, { hero_text: "x".repeat(301) }])).code).toBe("23514");
    expect((await rpc(A.claims, "save_site", [null, { contact_email: "nope" }])).code).toBe("23514");
    expect((await rpc(A.claims, "save_site", [null, { contact_email: "a@b.cc?bcc=x@y.zz&body=hi" }])).code).toBe("23514"); // goes into a mailto: link
  });

  test("renaming and reading the admin view of B are refused", async () => {
    expect((await rpc(A.claims, "update_tenant_name", [B.id, "Hijacked"])).code).toBe("42501");
    expect((await rpc(A.claims, "get_admin_site", [B.id])).code).toBe("42501");
    expect((await root(`select name from public.tenants where id = $1`, [B.id]))[0].name).toBe(`Shop ${B.slug}`);
    expect((await rpc(A.claims, "update_tenant_name", [null, "Better Name"])).code).toBeUndefined();
    expect((await rpc(A.claims, "update_tenant_name", [null, "x"])).code).toBe("23514");
  });

  test("a tenant admin cannot call any platform function", async () => {
    for (const [fn, args] of [
      ["platform_list_tenants", []], ["platform_get_tenant", [B.id]], ["platform_set_status", [B.id, "suspended"]],
      ["platform_set_slug", [B.id, "stolen"]], ["platform_grant_support", [B.id, "I would like to look"]],
      ["platform_list_audit", []], ["platform_list_reserved", []], ["platform_add_reserved", ["x1"]], ["platform_remove_reserved", ["www"]],
    ] as const) {
      expect((await rpc(A.claims, fn, [...args])).code).toBe("42501");
    }
  });

  test("brand images: only into one's own folder, with a generated name", async () => {
    const ins = (name: string) => run("authenticated", A.claims, `insert into storage.objects (bucket_id, name) values ('brand', $1)`, [name]);
    expect((await ins(`${A.id}/${crypto.randomUUID()}.png`)).code).toBeUndefined();
    expect((await ins(`${B.id}/${crypto.randomUUID()}.png`)).code).toBe("42501");
    expect((await ins(`${A.id}/logo.png`)).code).toBe("42501");
    expect((await ins(`${A.id}/${crypto.randomUUID()}.svg`)).code).toBe("42501");
    expect((await run("authenticated", A.claims, `insert into storage.objects (bucket_id, name) values ('other', $1)`, [`${A.id}/${crypto.randomUUID()}.png`])).code).toBe("42501");
    const [b] = await root(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'brand'`);
    expect(b).toEqual({ public: true, file_size_limit: 2097152, allowed_mime_types: ["image/png", "image/jpeg", "image/webp"] });
  });

  test("a registrant-style outsider (signed in, no tenant) gets nothing", async () => {
    const nobody = { sub: await mkUser() };
    expect(await run("authenticated", nobody, `select id, email from public.registrations`)).toEqual({ rows: [] });
    expect((await rpc(nobody, "list_registrations")).code).toBe("42501");
    expect((await rpc(nobody, "export_registrations")).code).toBe("42501");
    expect((await rpc(nobody, "save_site", [null, {}])).code).toBe("42501");
  });
});

describe("platform admin (super admin)", () => {
  test("bootstrap is for the service role only", async () => {
    const user = await mkUser();
    expect((await rpc({ sub: user }, "bootstrap_platform_admin", [user])).code).toBe("42501");
    expect((await rpc(null, "bootstrap_platform_admin", [user], "anon")).code).toBe("42501");
    expect((await rpc(null, "bootstrap_platform_admin", [user], "service_role")).code).toBeUndefined();
  });

  test("without a second factor, a platform admin gets mfa_required and sees no tenant rows", async () => {
    const t = await mkTenant();
    const p = await mkPlatform();
    expect((await rpc(p.aal1, "platform_list_tenants")).message).toBe("mfa_required");
    expect(await run("authenticated", p.aal1, `select id from public.tenants where id = $1`, [t.id])).toEqual({ rows: [] });
    expect((await rpc(p.aal1, "whoami")).rows[0].v).toMatchObject({ platform_admin: true, aal: "aal1" });
  });

  test("with a second factor, lists every tenant with counts and the admin email", async () => {
    const t = await mkTenant();
    await register(t.slug);
    const p = await mkPlatform();
    const v = (await rpc(p.aal2, "platform_list_tenants", [t.slug])).rows[0].v;
    expect(v.total).toBe(1);
    expect(v.rows[0]).toMatchObject({ slug: t.slug, status: "active", registrations: 1 });
    expect(v.rows[0].admin_email).toContain("@example.test");
  });

  test("tenants' people stay hidden until a grant with a reason; the grant is logged, shown to the tenant, and expires", async () => {
    const t = await mkTenant();
    await register(t.slug, "private@example.test");
    const p = await mkPlatform();

    expect((await rpc(p.aal2, "list_registrations", [t.id])).code).toBe("42501");
    expect(await run("authenticated", p.aal2, `select id, email from public.registrations where tenant_id = $1`, [t.id])).toEqual({ rows: [] });
    expect((await rpc(p.aal2, "platform_grant_support", [t.id, "too short"])).message).toContain("at least 10");

    const granted = await rpc(p.aal2, "platform_grant_support", [t.id, "Customer asked us to check their list"]);
    expect(granted.code).toBeUndefined();
    const seen = (await rpc(p.aal2, "list_registrations", [t.id])).rows[0].v;
    expect(seen.rows.map((r: any) => r.email)).toEqual(["private@example.test"]);
    expect((await run("authenticated", p.aal2, `select email from public.registrations where tenant_id = $1`, [t.id])).rows.length).toBe(1);

    const audit = (await rpc(t.claims, "list_my_audit")).rows[0].v.rows;
    const actions = audit.map((r: any) => r.action);
    expect(actions).toContain("support_granted");
    expect(actions).toContain("support_view");
    expect(audit.find((r: any) => r.action === "support_granted").detail.reason).toBe("Customer asked us to check their list");

    // aal1 with the same grant: still nothing.
    expect((await rpc(p.aal1, "list_registrations", [t.id])).code).toBe("42501");
    // another platform admin does not inherit the grant.
    const other = await mkPlatform();
    expect((await rpc(other.aal2, "list_registrations", [t.id])).code).toBe("42501");

    await root(`update public.support_access set expires_at = now() - interval '1 minute' where tenant_id = $1`, [t.id]);
    expect((await rpc(p.aal2, "list_registrations", [t.id])).code).toBe("42501");
    expect((await rpc(p.aal2, "platform_get_tenant", [t.id])).rows[0].v.support_expires_at).toBeNull();
  });

  test("suspending a tenant locks its admin out without deleting anything; reactivating restores it", async () => {
    const t = await mkTenant();
    await register(t.slug, "keep@example.test");
    const p = await mkPlatform();
    expect((await rpc(p.aal2, "platform_set_status", [t.id, "suspended"])).code).toBeUndefined();

    expect((await rpc(t.claims, "list_registrations")).message).toBe("site_suspended");
    expect((await rpc(t.claims, "get_admin_site")).message).toBe("site_suspended");
    expect((await rpc(t.claims, "save_site", [null, {}])).message).toBe("site_suspended");
    expect(await run("authenticated", t.claims, `select id, email from public.registrations`)).toEqual({ rows: [] });
    expect((await rpc(t.claims, "whoami")).rows[0].v.tenant.status).toBe("suspended");
    expect((await rpc(null, "get_site", [t.slug], "anon")).rows[0].v).toEqual({ status: "suspended" });
    expect((await root(`select count(*)::int as n from public.registrations where tenant_id = $1`, [t.id]))[0].n).toBe(1);

    expect((await rpc(p.aal2, "platform_set_status", [t.id, "active"])).code).toBeUndefined();
    expect((await rpc(t.claims, "list_registrations")).rows[0].v.total).toBe(1);
    expect((await rpc(p.aal2, "platform_set_status", [t.id, "deleted"])).message).toContain("active or suspended");
    const acts = (await root(`select action from public.audit_log where tenant_id = $1 order by id`, [t.id])).map((r) => r.action);
    expect(acts).toEqual(["tenant_created", "tenant_suspended", "tenant_reactivated"]);
  });

  test("changing a slug: reserved and taken are refused; the old address stops working; the change is logged", async () => {
    const t = await mkTenant();
    const other = await mkTenant();
    const p = await mkPlatform();
    expect((await rpc(p.aal2, "platform_set_slug", [t.id, "www"])).message).toContain("reserved");
    expect((await rpc(p.aal2, "platform_set_slug", [t.id, other.slug])).message).toContain("taken");
    expect((await rpc(p.aal2, "platform_set_slug", [t.id, "Bad Slug"])).message).toContain("3 to 40");
    const next = uniq("renamed");
    expect((await rpc(p.aal2, "platform_set_slug", [t.id, next])).code).toBeUndefined();
    expect((await rpc(null, "get_site", [t.slug], "anon")).rows[0].v).toBeNull();
    expect((await rpc(null, "get_site", [next], "anon")).rows[0].v.slug).toBe(next);
    const log = await root(`select detail from public.audit_log where tenant_id = $1 and action = 'slug_changed'`, [t.id]);
    expect(log).toEqual([{ detail: { from: t.slug, to: next } }]);
  });

  test("the reserved list can be edited and the change takes effect", async () => {
    const p = await mkPlatform();
    const word = uniq("blocked");
    expect((await rpc(p.aal2, "platform_add_reserved", [word])).code).toBeUndefined();
    expect((await rpc(null, "slug_status", [word], "anon")).rows[0].v).toBe("reserved");
    expect((await rpc(p.aal2, "platform_list_reserved")).rows[0].v).toContain(word);
    expect((await rpc(p.aal2, "platform_remove_reserved", [word])).code).toBeUndefined();
    expect((await rpc(null, "slug_status", [word], "anon")).rows[0].v).toBe("available");
    expect((await rpc(p.aal2, "platform_add_reserved", ["Not Valid"])).message).toContain("letters");
  });

  test("the platform can edit a tenant's branding without a grant, and that is logged", async () => {
    const t = await mkTenant();
    const p = await mkPlatform();
    expect((await rpc(p.aal2, "save_site", [t.id, { brand_color: "#123456" }])).code).toBeUndefined();
    expect((await rpc(p.aal2, "get_admin_site", [t.id])).rows[0].v.settings.brand_color).toBe("#123456");
    expect((await rpc(p.aal1, "save_site", [t.id, { brand_color: "#654321" }])).message).toBe("mfa_required");
    expect((await root(`select count(*)::int as n from public.audit_log where tenant_id = $1 and action = 'site_edited'`, [t.id]))[0].n).toBe(1);
  });

  test("the audit log can be read by the platform and never changed by anyone", async () => {
    const p = await mkPlatform();
    const v = (await rpc(p.aal2, "platform_list_audit")).rows[0].v;
    expect(v.rows.length).toBeGreaterThan(0);
    for (const sql of [`update public.audit_log set action = 'x'`, `delete from public.audit_log`, `truncate public.audit_log`]) {
      let failed = false;
      try {
        await db.exec(sql);
      } catch (e) {
        failed = (e as Error).message.includes("append-only");
      }
      expect(failed).toBe(true);
    }
  });
});
