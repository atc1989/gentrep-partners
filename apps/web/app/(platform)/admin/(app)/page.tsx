"use client";
import { TenantsList } from "@/components/admin/platform";
import { PageTitle } from "@/components/crm";

export default function Page() {
  return (
    <>
      <PageTitle>Tenants</PageTitle>
      <div className="cr-page"><div className="cr-page__head"><h1>Tenants</h1></div><TenantsList /></div>
    </>
  );
}
