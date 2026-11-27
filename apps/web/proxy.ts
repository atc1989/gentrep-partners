import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "./lib/host";

// Next 16 proxy (the old middleware). It only chooses the site: slug.root-domain/x is served by the page at /s/slug/x,
// the address bar never changes, and /s/... itself is never reachable from outside. It makes no data call and
// enforces no access: the API and RLS do that.
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/s" || pathname.startsWith("/s/")) return new NextResponse("Not found", { status: 404 });

  const host = parseHost(request.headers.get("host") ?? "", ROOT);
  if (host.kind === "invalid") return new NextResponse("Not found", { status: 404 });
  if (host.kind === "root") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/s/${host.slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

// Not the API (routed before Next), build output, or the platform icon.
export const config = { matcher: ["/((?!api/|_next/|favicon.ico|icon.svg).*)"] };
