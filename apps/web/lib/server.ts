import type { PublicSite } from "@gs/api/shared";
import { headers } from "next/headers";
import { cache } from "react";
import { API_URL } from "./config";
import { publicApi } from "./api";

/**
 * Where a server component reaches the API. Locally API_ORIGIN points straight at the API process. Deployed, the
 * page's own origin plus /api is routed to the API by the host, so no extra setting is needed.
 */
async function apiBase() {
  if (process.env.API_ORIGIN) return process.env.API_ORIGIN;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  return `${proto}://${host}${API_URL}`;
}

/** One lookup per request, shared by the layout, the metadata and the page. Null = no such site. */
export const getSite = cache(async (slug: string): Promise<PublicSite | null> => {
  const res = await publicApi(await apiBase()).public.sites({ slug }).get({ fetch: { cache: "no-store" } });
  if (res.status === 404) return null;
  if (res.error || !res.data) throw new Error("The site could not be loaded.");
  return res.data as PublicSite;
});
