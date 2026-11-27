// Which site a request is for. Pure, no imports: the proxy uses it and tests cover it.

export type HostKind = { kind: "root" } | { kind: "tenant"; slug: string } | { kind: "invalid" };

const LABEL = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * root = the platform site (sign-up, super admin). tenant = one label in front of the root domain.
 * Any other hostname (the host's own preview address, for example) serves the platform site.
 * A deeper name such as a.b.gentrep.xyz is invalid: the wildcard certificate covers one label.
 */
export function parseHost(rawHost: string, root: string): HostKind {
  const host = rawHost.trim().toLowerCase();
  const base = root.toLowerCase();
  if (host === base || host === `www.${base}`) return { kind: "root" };
  if (host.endsWith(`.${base}`)) {
    const label = host.slice(0, -(base.length + 1));
    return LABEL.test(label) && !label.includes("--") ? { kind: "tenant", slug: label } : { kind: "invalid" };
  }
  return { kind: "root" };
}

/** robots.txt body. A staging root (staging.<domain>) is never indexed; everything else lists only what to keep out. */
export const robotsText = (root: string, disallow: string[], sitemap: string) =>
  root.toLowerCase().startsWith("staging.") ? "User-agent: *\nDisallow: /\n" : `User-agent: *\n${disallow.map((d) => `Disallow: ${d}\n`).join("")}Sitemap: ${sitemap}\n`;
