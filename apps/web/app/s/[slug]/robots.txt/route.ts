// Always rendered per request.
export const dynamic = "force-dynamic";

import { ROOT_DOMAIN, siteUrl } from "@/lib/config";
import { robotsText } from "@/lib/host";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return new Response(robotsText(ROOT_DOMAIN, ["/admin", "/auth", "/my-qr"], `${siteUrl(slug)}/sitemap.xml`), { headers: { "content-type": "text/plain" } });
}
