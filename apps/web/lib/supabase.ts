"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

// Used for sign-in, the second factor and image upload only. All data goes through the API.
// The session cookie is host-only (no Domain), so a sign-in on one tenant's address never reaches another's.
let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: { sameSite: "lax", secure: typeof location !== "undefined" && location.protocol === "https:" },
  });
  return client;
}
