import { describe, expect, mock, test } from "bun:test";

let status: "active" | "suspended" | null = "active";
mock.module("@/lib/server", () => ({ getSite: async () => (status ? { status } : null) }));
const { GET } = await import("./route");

const hit = (code: string, proto = "https") =>
  GET(new Request("http://x.test/s/demo/j/" + code, { headers: { "x-forwarded-proto": proto } }), { params: Promise.resolve({ slug: "demo", code }) });

describe("invite link /j/<code>", () => {
  test("a valid code sets a host-only 30 day cookie and redirects to /registration", async () => {
    status = "active";
    const res = await hit("123456");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/registration");
    const c = res.headers.get("set-cookie") ?? "";
    expect(c).toContain("gs_ref=123456");
    for (const part of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000", "Secure"]) expect(c).toContain(part);
    expect(c).not.toContain("Domain");
  });

  test("no Secure flag over plain http (local development)", async () => {
    expect((await hit("123456", "http")).headers.get("set-cookie")).not.toContain("Secure");
  });

  test("a bad code, a suspended site or an unknown site sets no cookie but still redirects", async () => {
    for (const [s, code] of [["active", "12345"], ["active", "012345"], ["active", "abcdef"], ["suspended", "123456"], [null, "123456"]] as const) {
      status = s;
      const res = await hit(code);
      expect(res.status).toBe(307);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});
