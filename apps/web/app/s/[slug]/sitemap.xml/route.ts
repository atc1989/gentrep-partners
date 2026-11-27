// Always rendered per request: a tenant edits their site and expects it live at once.
export const dynamic = "force-dynamic";

import { siteUrl } from "@/lib/config";
import { getSite } from "@/lib/server";

// Public pages of an open site only. A suspended or unknown site lists nothing.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSite(slug);
  const urls = site?.status === "active" ? ["", "/registration", "/privacy"].map((p) => `<url><loc>${siteUrl(slug, p)}</loc></url>`).join("") : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "content-type": "application/xml" } });
}
