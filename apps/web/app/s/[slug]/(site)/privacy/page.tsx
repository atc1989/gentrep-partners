import type { Metadata } from "next";
import { PageFrame } from "@/components/sky/site";
import { TenantPrivacyDoc } from "@/components/sky/legal";
import { LEGAL_DRAFT } from "@/lib/config";
import { getSite } from "@/lib/server";

export const metadata: Metadata = { title: "Privacy notice" };

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const site = await getSite((await params).slug);
  if (!site || site.status !== "active") return null;
  return (
    <>
      {LEGAL_DRAFT && <p className="sk-draft" role="note">Draft notice, not yet reviewed. It will change before launch.</p>}
      <PageFrame site={{ name: site.name, slug: site.slug, settings: site.settings }}>
        <div style={{ marginTop: 32 }}><TenantPrivacyDoc name={site.name} contactEmail={site.settings.contact_email} reg={site.settings} /></div>
      </PageFrame>
    </>
  );
}
