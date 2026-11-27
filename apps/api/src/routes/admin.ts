import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { must } from "../db";
import { Body, Maybe, Page, SiteBody, SlugParam, Text, Uuid } from "../schema";
import { cleanText, csvRow, showMobile, type AdminSite, type AuditRow, type Me, type Paged, type Registration } from "../shared";

// Signed-in routes for a tenant's own admin, and the two every signed-in user needs (/me, /me/activate).
// Each is one call to a SQL function. The function decides who the caller is and which tenant it acts on;
// nothing here takes a tenant id from the request.

const OK = { ok: true } as const;
const Query = t.Object({ q: t.Optional(Text(100)), page: Page, ref: t.Optional(t.Numeric({ minimum: 100000, maximum: 999999 })) });

/** Company time (UTC+8), for people reading a spreadsheet. */
const manila = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).slice(0, 16);

export const me = new Elysia()
  .use(auth)
  .get("/me", async ({ db }) => must<Me>(await db.rpc("whoami")))
  .post(
    "/me/activate",
    async ({ db, body }) => must<{ slug: string }>(await db.rpc("activate_my_tenant", { p_slug: body.slug ?? null })),
    { body: Body({ slug: t.Optional(Maybe(SlugParam)) }) },
  );

export const admin = new Elysia({ prefix: "/admin" })
  .use(auth)
  .get("/site", async ({ db }) => must<AdminSite>(await db.rpc("get_admin_site", { p_tenant: null })))
  .put(
    "/site",
    async ({ db, body }) => {
      must(await db.rpc("save_site", { p_tenant: null, p_site: { ...body, brand_color: body.brand_color.toLowerCase() } }));
      return OK;
    },
    { body: SiteBody },
  )
  .patch(
    "/account",
    async ({ db, body }) => {
      must(await db.rpc("update_tenant_name", { p_tenant: null, p_name: cleanText(body.name) }));
      return OK;
    },
    { body: Body({ name: Text(80, 2) }) },
  )
  .get(
    "/registrations",
    async ({ db, query }) =>
      must<Paged<Registration>>(await db.rpc("list_registrations", { p_tenant: null, p_q: query.q ?? null, p_page: query.page ?? 1, p_ref: query.ref ?? null })),
    { query: Query },
  )
  .delete(
    "/registrations/:id",
    async ({ db, params }) => {
      must(await db.rpc("delete_registration", { p_id: params.id }));
      return OK;
    },
    { params: t.Object({ id: Uuid }) },
  )
  .get("/registrations-export", async ({ db }) => {
    const rows = must<(Omit<Registration, "created_at" | "referred_by_name"> & { registered_at: string })[]>(await db.rpc("export_registrations"));
    const lines = [csvRow(["Title", "Name", "Email", "Mobile", "City", "Category", "Address", "Where found", "Code", "Invited by (code)", "Type", "Registered (UTC+8)"])];
    for (const r of rows) {
      lines.push(csvRow([r.name_prefix, r.full_name, r.email, showMobile(r.mobile), r.city, r.category, r.address, r.source, r.member_code, r.referred_by_code, r.member_type, manila(r.registered_at)]));
    }
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="registrations.csv"', "cache-control": "no-store" },
    });
  })
  .get(
    "/audit",
    async ({ db, query }) => must<{ rows: AuditRow[]; page: number; page_size: number }>(await db.rpc("list_my_audit", { p_page: query.page ?? 1 })),
    { query: t.Object({ page: Page }) },
  );

