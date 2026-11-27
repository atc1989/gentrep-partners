"use client";
import { SiteEditor } from "@/components/admin/site-editor";
import { PageTitle } from "@/components/crm";
import { api, call } from "@/lib/api";

export default function SitePage() {
  return (
    <div className="cr-page">
      <PageTitle>Site</PageTitle>
      <div className="cr-page__head"><h1>Site</h1></div>
      <SiteEditor load={() => call(api.admin.site.get())} save={(s) => call(api.admin.site.put(s))} />
    </div>
  );
}
