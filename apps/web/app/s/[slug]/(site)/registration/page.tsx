import { INVITE_CODE_RE } from "@gs/api/shared";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageFrame } from "@/components/sky/site";
import { RegisterForm } from "@/components/sky/register-form";
import { getSite } from "@/lib/server";

export const metadata: Metadata = { title: "Register" };

export default async function RegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const site = await getSite((await params).slug);
  if (!site || site.status !== "active") return null;
  const ref = (await cookies()).get("gs_ref")?.value; // set by /j/<code>; the API checks it again
  const s = site.settings;
  return (
    <PageFrame site={{ name: site.name, slug: site.slug, settings: s }}>
      <div className="sk-card sk-narrow" style={{ marginTop: 32 }}>
        <RegisterForm
          slug={site.slug}
          name={site.name}
          reg={{ reg_category_label: s.reg_category_label, reg_categories: s.reg_categories, reg_show_address: s.reg_show_address, reg_show_source: s.reg_show_source }}
          refCode={ref && INVITE_CODE_RE.test(ref) ? ref : undefined}
        />
      </div>
    </PageFrame>
  );
}
