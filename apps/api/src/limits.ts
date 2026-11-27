// Fixed-window rate limits, kept in memory.
// ponytail: per instance only. Add Redis (shared counters) before running more than one API instance.

const hits = new Map<string, { count: number; resetAt: number }>();

/** true = allowed. Counts the attempt either way. */
export function allow(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
}, 60_000).unref();

/** The caller's address. On Vercel the first x-forwarded-for entry is the visitor. */
export function clientIp(headers: Record<string, string | undefined>): string {
  return headers["x-forwarded-for"]?.split(",")[0]?.trim() || headers["x-real-ip"] || "local";
}
