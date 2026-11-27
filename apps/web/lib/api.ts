import { treaty } from "@elysiajs/eden";
import type { App } from "@gs/api";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Browser client: sends the signed-in user's token as a Bearer header. The API never reads cookies. */
export const api = treaty<App>(API_URL, {
  keepDomain: true,
  parseDate: false,
  headers: async () => {
    const { getSupabase } = await import("./supabase");
    const { data } = await getSupabase().auth.getSession();
    return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
  },
});

/** Server components: public routes only, so no token. `base` is the API's address (see lib/server.ts). */
export const publicApi = (base: string) => treaty<App>(base.replace(/\/$/, ""), { keepDomain: true, parseDate: false });

type Result = { data: unknown; error: { status: unknown; value: unknown } | null };

/** Unwraps an Eden result: the data, or a thrown ApiError with the API's own message. */
export async function call<R extends Result>(request: Promise<R>): Promise<NonNullable<Extract<R, { error: null }>["data"]>> {
  const res = await request;
  if (!res.error) return res.data as NonNullable<Extract<R, { error: null }>["data"]>;
  const status = typeof res.error.status === "number" ? res.error.status : 503;
  const body = (res.error.value ?? {}) as { error?: string; code?: string };
  if (status === 401 && typeof window !== "undefined" && !location.pathname.endsWith("/login")) {
    window.location.assign("/admin/login");
  }
  throw new ApiError(status, body.error ?? (status === 503 ? "Could not reach the server. Check your connection." : "Something went wrong. Try again."), body.code);
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");
