import type { Metadata } from "next";
import { MemberQr } from "@/components/sky/member-qr";
import { PageFrame } from "@/components/sky/site";
import { getSite } from "@/lib/server";

export const metadata: Metadata = { title: "Your invite QR", robots: { index: false } };

export default async function MyQrPage({ params }: { params: Promise<{ slug: string }> }) {
  const site = await getSite((await params).slug);
  if (!site || site.status !== "active") return null;
  return (
    <PageFrame site={{ name: site.name, slug: site.slug, settings: site.settings }}>
      <div className="sk-card sk-narrow" style={{ marginTop: 32 }}>
        <MemberQr slug={site.slug} name={site.name} />
      </div>
    </PageFrame>
  );
}
