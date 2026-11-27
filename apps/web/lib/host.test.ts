import { describe, expect, test } from "bun:test";
import { parseHost, robotsText } from "./host";

describe("parseHost", () => {
  const root = "gentrep.xyz";
  test("the root and www are the platform site", () => {
    expect(parseHost("gentrep.xyz", root)).toEqual({ kind: "root" });
    expect(parseHost("www.gentrep.xyz", root)).toEqual({ kind: "root" });
    expect(parseHost("GENTREP.XYZ", root)).toEqual({ kind: "root" });
  });
  test("one label in front is a tenant", () => {
    expect(parseHost("sunrise.gentrep.xyz", root)).toEqual({ kind: "tenant", slug: "sunrise" });
    expect(parseHost("juans-shop-2.gentrep.xyz", root)).toEqual({ kind: "tenant", slug: "juans-shop-2" });
    expect(parseHost("Sunrise.Gentrep.XYZ", root)).toEqual({ kind: "tenant", slug: "sunrise" });
  });
  test("deeper or malformed names are invalid, not a tenant", () => {
    for (const h of ["a.b.gentrep.xyz", "-x-.gentrep.xyz", "ab.gentrep.xyz", "a--b.gentrep.xyz", "a_b.gentrep.xyz", ".gentrep.xyz"]) {
      expect(parseHost(h, root)).toEqual({ kind: "invalid" });
    }
  });
  test("lookalike hosts do not become tenants", () => {
    expect(parseHost("evilgentrep.xyz", root)).toEqual({ kind: "root" });
    expect(parseHost("sunrise.gentrep.xyz.evil.test", root)).toEqual({ kind: "root" });
  });
  test("ports and staging roots", () => {
    expect(parseHost("sunrise.localhost:3000", "localhost:3000")).toEqual({ kind: "tenant", slug: "sunrise" });
    expect(parseHost("localhost:3000", "localhost:3000")).toEqual({ kind: "root" });
    expect(parseHost("sunrise.staging.gentrep.xyz", "staging.gentrep.xyz")).toEqual({ kind: "tenant", slug: "sunrise" });
    expect(parseHost("staging.gentrep.xyz", "staging.gentrep.xyz")).toEqual({ kind: "root" });
  });
  test("the host's own preview address serves the platform site", () => {
    expect(parseHost("gentrep-sites-abc.vercel.app", root)).toEqual({ kind: "root" });
  });
});

describe("robotsText", () => {
  test("staging blocks everything and lists no sitemap", () => {
    expect(robotsText("staging.gentrep.xyz", ["/admin"], "https://x/sitemap.xml")).toBe("User-agent: *\nDisallow: /\n");
  });
  test("production keeps the usual rules", () => {
    expect(robotsText("gentrep.xyz", ["/admin", "/auth"], "https://gentrep.xyz/sitemap.xml")).toBe("User-agent: *\nDisallow: /admin\nDisallow: /auth\nSitemap: https://gentrep.xyz/sitemap.xml\n");
  });
});
