import { ROOT_DOMAIN, siteUrl } from "@/lib/config";
import { robotsText } from "@/lib/host";

// Public pages only; the admin is never listed. Staging lists nothing. (playbook: 06 - Deploy, "Search engines")
export function GET() {
  const root = siteUrl("www").replace("//www.", "//");
  return new Response(robotsText(ROOT_DOMAIN, ["/admin", "/auth"], `${root}/sitemap.xml`), { headers: { "content-type": "text/plain" } });
}
