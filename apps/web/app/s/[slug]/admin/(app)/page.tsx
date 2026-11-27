"use client";
import { RegistrationsView } from "@/components/admin/registrations";
import { PageTitle } from "@/components/crm";
import { api, call } from "@/lib/api";

export default function RegistrationsPage() {
  return (
    <div className="cr-page">
      <PageTitle>Registrations</PageTitle>
      <div className="cr-page__head"><h1>Registrations</h1></div>
      <RegistrationsView
        load={(q, page) => call(api.admin.registrations.get({ query: { q: q || undefined, page } }))}
        onDelete={(id) => call(api.admin.registrations({ id }).delete())}
        exportPath="/admin/registrations-export"
      />
    </div>
  );
}
