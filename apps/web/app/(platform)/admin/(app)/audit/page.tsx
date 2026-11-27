"use client";
import { AuditView } from "@/components/admin/platform";
import { PageTitle } from "@/components/crm";

export default function Page() {
  return (
    <>
      <PageTitle>Audit log</PageTitle>
      <div className="cr-page"><div className="cr-page__head"><h1>Audit log</h1></div><AuditView /></div>
    </>
  );
}
