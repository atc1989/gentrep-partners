import type { AuditRow } from "@gs/api/shared";

/** One plain sentence per log action, written for the person reading the log. */
export function describe(row: Pick<AuditRow, "action" | "detail">): string {
  const d = row.detail as Record<string, string | number>;
  switch (row.action) {
    case "tenant_created": return "Site created";
    case "registration_deleted": return "A registration was deleted";
    case "registrations_exported": return `Registrations exported (${d.rows ?? 0} rows)`;
    case "support_granted": return `Platform support opened the registrations for 1 hour. Reason: ${d.reason ?? "none given"}`;
    case "support_view": return "Platform support viewed the registrations";
    case "site_edited": return "Site edited by the platform team";
    case "slug_changed": return `Address changed from ${d.from} to ${d.to}`;
    case "tenant_suspended": return "Site suspended";
    case "tenant_reactivated": return "Site reactivated";
    case "reserved_added": return `Address "${d.slug}" added to the reserved list`;
    case "reserved_removed": return `Address "${d.slug}" removed from the reserved list`;
    case "platform_admin_added": return "Super admin added";
    default: return row.action.replaceAll("_", " ");
  }
}

export const ACTOR: Record<AuditRow["actor_kind"], string> = { tenant_admin: "Site admin", platform_admin: "Platform team", system: "System" };
