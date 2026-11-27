import type { Metadata } from "next";
import { PageFrame } from "@/components/sky/site";
import { RegisterForm } from "@/components/sky/register-form";
import { getSite } from "@/lib/server";

export const metadata: Metadata = { title: "Register" };

export default async function RegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const site = await getSite((await params).slug);
  if (!site || site.status !== "active") return null;
  return (
    <PageFrame site={{ name: site.name, slug: site.slug, settings: site.settings }}>
      <div className="sk-card sk-narrow" style={{ marginTop: 32 }}>
        <RegisterForm slug={site.slug} name={site.name} />
      </div>
    </PageFrame>
  );
}
