// Public configuration. Only NEXT_PUBLIC_* values: they are built into the pages.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
export const LEGAL_DRAFT = process.env.NEXT_PUBLIC_LEGAL_DRAFT !== "false";

/** Public URL of a stored brand image. The path is validated by the database, never typed by a visitor. */
export const imageUrl = (path: string | null | undefined) => (path ? `${SUPABASE_URL}/storage/v1/object/public/brand/${path}` : null);

export const siteUrl = (slug: string, path = "") => {
  const scheme = ROOT_DOMAIN.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${slug}.${ROOT_DOMAIN}${path}`;
};
