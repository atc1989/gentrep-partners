import { Elysia } from "elysia";
import { env } from "./env";
import { admin, me } from "./routes/admin";
import { platform } from "./routes/platform";
import { publicRoutes } from "./routes/public";

// No CORS plugin: the browser reaches this API on its own origin (/api), so there is nothing to allow.
// The API reads a Bearer header only, never a cookie, so another site cannot make a browser act for a user.

// normalize: false makes Elysia reject unknown body fields (422) instead of silently dropping them.
export const app = new Elysia({ normalize: false })
  .onAfterHandle(({ set }) => {
    set.headers["cache-control"] = "no-store";
    set.headers["x-content-type-options"] = "nosniff";
  })
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { error: "Some fields are missing or invalid." };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found." };
    }
    if (code === "PARSE") {
      set.status = 400;
      return { error: "Send JSON." };
    }
    if (typeof code === "number") return; // a thrown status(...): already safe
    console.error(error instanceof Error ? error.stack : "non-Error thrown"); // never the object: it can carry request details
    set.status = 500;
    return { error: "Something went wrong. Try again." };
  })
  .get("/health", () => ({ ok: true }))
  .use(publicRoutes)
  .use(me)
  .use(admin)
  .use(platform);

export type App = typeof app;

/**
 * On Vercel the API is the "api" service behind the public rewrite /api/(.*), and a service receives the original
 * path (/api/me). Strip that prefix; requests without it (local dev, tests, a standalone host) pass through.
 */
export function handle(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return app.handle(request);
  url.pathname = url.pathname.slice(4) || "/";
  return app.handle(new Request(url, request));
}

if (import.meta.main) {
  Bun.serve({ port: env.PORT, fetch: handle });
  console.log(`Gentrep API on :${env.PORT} (${env.APP_ENV})`);
}
