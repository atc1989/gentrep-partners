import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SkyRoot } from "@/components/sky/site";
import { content, logoUrl } from "@/lib/site";
import { getSite } from "@/lib/server";

export const dynamic = "force-dynamic"; // a tenant edits their site and expects it live at once

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const site = await getSite((await params).slug);
  if (!site || site.status !== "active") return { title: "Unavailable", robots: { index: false } };
  const c = content(site.name, site.settings);
  const icon = logoUrl({ ...site.settings, logo_path: site.settings.favicon_path ?? site.settings.logo_path });
  return {
    title: { default: c.title, template: `%s · ${site.name}` },
    description: c.description,
    ...(icon ? { icons: { icon } } : {}),
  };
}

export default async function SiteLayout({ children, params }: Props) {
  const site = await getSite((await params).slug);
  if (!site) notFound();
  if (site.status !== "active") {
    return (
      <div className="sky">
        <main className="sk-wrap sk-main" id="main" style={{ paddingTop: 64 }}>
          <div className="sk-status sk-text">
            <h1 className="sk-h2">This site is unavailable</h1>
            <p className="sk-muted">It is not open right now. Please try again later.</p>
          </div>
        </main>
      </div>
    );
  }
  return <SkyRoot brandColor={site.settings.brand_color}>{children}</SkyRoot>;
}
