"use client";
import { ReservedList } from "@/components/admin/platform";
import { PageTitle } from "@/components/crm";

export default function Page() {
  return (
    <>
      <PageTitle>Reserved addresses</PageTitle>
      <div className="cr-page"><div className="cr-page__head"><h1>Reserved addresses</h1></div><ReservedList /></div>
    </>
  );
}
