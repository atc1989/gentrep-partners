import type { SiteSettings } from "@gs/api/shared";
import { deriveTheme, safeUrl } from "@gs/api/shared";
import type { CSSProperties } from "react";
import { imageUrl } from "./config";

export type SiteData = { name: string; slug: string; settings: SiteSettings };

/**
 * Neutral starting copy for a new tenant. It is true for any business and says nothing about health, money or
 * results, so no tenant inherits a claim they did not make. A tenant's own words replace it.
 */
export function content(name: string, s: SiteSettings) {
  const hasContact = Boolean(s.contact_email || s.contact_phone || s.contact_address);
  return {
    headline: s.hero_headline ?? `Join ${name}`,
    lead: s.hero_text ?? `Register in about a minute and ${name} will have your details.`,
    title: s.seo_title ?? name,
    description: s.seo_description ?? s.hero_text ?? `Register with ${name}.`,
    hasContact,
    features: [
      { icon: "user-plus", title: "Register in minutes", text: "One short form: your name, email, mobile number and city." },
      { icon: "shield-check", title: "Your details stay private", text: `${name} uses your details only as the privacy notice says, and you can ask to have them removed.` },
      { icon: "message-circle", title: "Reach the team", text: `Questions about your registration? Ask ${name} directly.` },
    ] as const,
    faq: [
      { q: "How do I register?", a: "Press Register now and fill in the short form. It takes about a minute." },
      { q: "What happens to my details?", a: `${name} keeps them to manage your registration. The privacy notice says what is kept, why, and how to ask for removal.` },
      { q: "Can I register more than once?", a: "One registration for each email address is enough." },
      ...(hasContact ? [{ q: `How do I contact ${name}?`, a: "Use the contact details at the bottom of this page." }] : []),
    ],
  };
}

/** Tenant colour as CSS variables on the page root. Only values from deriveTheme (validated hex) reach style. */
export function themeStyle(brandColor: string): CSSProperties {
  const t = deriveTheme(brandColor);
  return { "--brand": t.brand, "--brand-hover": t.hover, "--brand-ink": t.brand, "--sky": t.pale } as CSSProperties;
}

export const logoUrl = (s: SiteSettings) => imageUrl(s.logo_path);
export const heroUrl = (s: SiteSettings) => imageUrl(s.hero_image_path);
export const socials = (s: SiteSettings) =>
  [
    ["Facebook", safeUrl(s.facebook_url)],
    ["Instagram", safeUrl(s.instagram_url)],
    ["TikTok", safeUrl(s.tiktok_url)],
    ["YouTube", safeUrl(s.youtube_url)],
  ].filter((x): x is [string, string] => Boolean(x[1]));
