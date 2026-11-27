import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { must } from "../db";
import { Body, Page, SiteBody, SlugParam, Text, Uuid } from "../schema";
import { cleanText, type AdminSite, type AuditRow, type Paged, type Registration, type TenantDetail, type TenantRow } from "../shared";

// Super admin. Each SQL function starts with app.require_platform(): a platform admin who passed the second
// factor (aal2). Tenants' people stay closed until platform_grant_support (reason, one hour, logged).

const OK = { ok: true } as const;
const Id = t.Object({ id: Uuid });
const Query = t.Object({ q: t.Optional(Text(100)), page: Page });

export const platform = new Elysia({ prefix: "/platform" })
  .use(auth)
  .get("/tenants", async ({ db, query }) => must<Paged<TenantRow>>(await db.rpc("platform_list_tenants", { p_q: query.q ?? null, p_page: query.page ?? 1 })), { query: Query })
  .get("/tenants/:id", async ({ db, params }) => must<TenantDetail>(await db.rpc("platform_get_tenant", { p_tenant: params.id })), { params: Id })
  .patch(
    "/tenants/:id",
    async ({ db, params, body }) => {
      if (body.slug !== undefined) must(await db.rpc("platform_set_slug", { p_tenant: params.id, p_slug: body.slug }));
      if (body.name !== undefined) must(await db.rpc("update_tenant_name", { p_tenant: params.id, p_name: cleanText(body.name) }));
      if (body.status !== undefined) must(await db.rpc("platform_set_status", { p_tenant: params.id, p_status: body.status }));
      return OK;
    },
    { params: Id, body: Body({ slug: t.Optional(t.String({ maxLength: 40 })), name: t.Optional(Text(80, 2)), status: t.Optional(t.Union([t.Literal("active"), t.Literal("suspended")])) }) },
  )
  .get("/tenants/:id/site", async ({ db, params }) => must<AdminSite>(await db.rpc("get_admin_site", { p_tenant: params.id })), { params: Id })
  .put(
    "/tenants/:id/site",
    async ({ db, params, body }) => {
      must(await db.rpc("save_site", { p_tenant: params.id, p_site: { ...body, brand_color: body.brand_color.toLowerCase() } }));
      return OK;
    },
    { params: Id, body: SiteBody },
  )
  .post(
    "/tenants/:id/support",
    async ({ db, params, body }) => ({ expires_at: must<string>(await db.rpc("platform_grant_support", { p_tenant: params.id, p_reason: cleanText(body.reason) })) }),
    { params: Id, body: Body({ reason: Text(300, 10) }) },
  )
  .get(
    "/tenants/:id/registrations",
    async ({ db, params, query }) => must<Paged<Registration>>(await db.rpc("list_registrations", { p_tenant: params.id, p_q: query.q ?? null, p_page: query.page ?? 1 })),
    { params: Id, query: Query },
  )
  .get(
    "/audit",
    async ({ db, query }) => must<{ rows: AuditRow[]; page: number; page_size: number }>(await db.rpc("platform_list_audit", { p_tenant: query.tenant ?? null, p_page: query.page ?? 1 })),
    { query: t.Object({ tenant: t.Optional(Uuid), page: Page }) },
  )
  .get("/reserved", async ({ db }) => must<string[]>(await db.rpc("platform_list_reserved")))
  .post(
    "/reserved",
    async ({ db, body }) => {
      must(await db.rpc("platform_add_reserved", { p_slug: body.slug }));
      return OK;
    },
    { body: Body({ slug: SlugParam }) },
  )
  .delete(
    "/reserved/:slug",
    async ({ db, params }) => {
      must(await db.rpc("platform_remove_reserved", { p_slug: params.slug }));
      return OK;
    },
    { params: t.Object({ slug: t.String({ maxLength: 40 }) }) },
  );
