import { siteUrl } from "@/lib/config";

// Public pages only; the admin is never listed. (playbook: 06 - Deploy, "Search engines")
export function GET() {
  const root = siteUrl("www").replace("//www.", "//");
  return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /auth\nSitemap: ${root}/sitemap.xml\n`, { headers: { "content-type": "text/plain" } });
}
