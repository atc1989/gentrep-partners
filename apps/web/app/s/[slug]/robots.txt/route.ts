// Always rendered per request.
export const dynamic = "force-dynamic";

import { siteUrl } from "@/lib/config";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /auth\nDisallow: /my-qr\nSitemap: ${siteUrl(slug)}/sitemap.xml\n`, { headers: { "content-type": "text/plain" } });
}
