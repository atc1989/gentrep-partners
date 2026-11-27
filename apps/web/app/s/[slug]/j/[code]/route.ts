// Always rendered per request.
export const dynamic = "force-dynamic";

import { INVITE_CODE_RE } from "@gs/api/shared";
import { getSite } from "@/lib/server";

/**
 * The invite link a member shares (https://slug.domain/j/123456, the address the QR holds). It remembers who invited
 * the visitor in a host-only cookie for 30 days, then sends them to the registration page. The cookie is strictly what
 * the invite needs: it holds only the six digits and is read by the registration page, never by scripts.
 * The redirect is relative, so it always lands on the host the visitor typed, with no domain written in code.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const headers = new Headers({ location: "/registration", "cache-control": "no-store" });
  const site = INVITE_CODE_RE.test(code) ? await getSite(slug).catch(() => null) : null;
  if (site?.status === "active") {
    const https = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")) === "https";
    // No Domain attribute: the cookie belongs to this one host, so another tenant's site never sees it.
    headers.append("set-cookie", `gs_ref=${code}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`);
  }
  return new Response(null, { status: 307, headers });
}
