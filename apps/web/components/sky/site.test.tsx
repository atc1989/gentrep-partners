import { describe, expect, test } from "bun:test";
import type { SiteSettings } from "@gs/api/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing, PageFrame, SkyRoot } from "./site";

const base: SiteSettings = {
  brand_color: "#7c3aed", logo_path: null, favicon_path: null, hero_image_path: null, hero_headline: null, hero_text: null,
  contact_email: null, contact_phone: null, contact_address: null, facebook_url: null, instagram_url: null, tiktok_url: null, youtube_url: null,
  footer_blurb: null, seo_title: null, seo_description: null, show_features: true, show_join: true, show_faq: false, show_contact: true,
};
const render = (name: string, settings: Partial<SiteSettings> = {}) =>
  renderToStaticMarkup(<SkyRoot brandColor={settings.brand_color ?? base.brand_color}><Landing site={{ name, slug: "demo", settings: { ...base, ...settings } }} /></SkyRoot>);

describe("tenant landing page markup", () => {
  test("a new tenant gets neutral copy, one h1, a way to register, and the tenant's colour", () => {
    const html = render("Sunrise Wellness");
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("Join Sunrise Wellness");
    expect(html).toContain('href="/registration"');
    expect(html).toContain("--brand:#7c3aed");
    expect(html).toContain("Register in minutes");
    expect(html).toContain("Site by");
    for (const claim of ["cure", "treat", "heal", "guarantee", "%", "₱"]) expect(html.toLowerCase()).not.toContain(claim);
  });

  test("text a tenant types is escaped, never run as HTML", () => {
    const html = render('<img src=x onerror=alert(1)> Shop', { hero_headline: '"><script>alert(1)</script>', footer_blurb: "<b>bold</b>" });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  test("only http(s) social links and contact links appear", () => {
    const html = render("Shop", { facebook_url: "javascript:alert(1)", instagram_url: "https://instagram.com/shop", contact_email: "hi@example.test", contact_phone: "+63 917 123 4567" });
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://instagram.com/shop"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:hi@example.test"');
    expect(html).toContain('href="tel:+639171234567"');
  });

  test("sections switch off; contact shows only when there is something to show", () => {
    const off = render("Shop", { show_features: false, show_join: false, show_contact: true });
    expect(off).not.toContain("Why register");
    expect(off).not.toContain("Ready to join?");
    expect(off).not.toContain("Talk to us.");
    expect(render("Shop", { contact_email: "hi@example.test" })).toContain("Talk to us.");
    const faq = render("Shop", { show_faq: true });
    expect(faq).toContain("<details");
    expect(faq).not.toContain("How do I contact");
  });

  test("a very light brand colour is darkened so the button text stays readable", () => {
    expect(render("Shop", { brand_color: "#ffffff" })).not.toContain("--brand:#ffffff");
  });

  test("inner pages carry the nav, the content and the footer", () => {
    const html = renderToStaticMarkup(<SkyRoot brandColor="#0068d0"><PageFrame site={{ name: "Shop", slug: "demo", settings: base }}><p>content</p></PageFrame></SkyRoot>);
    expect(html).toContain("content");
    expect(html).toContain("Privacy notice");
    expect(html).toContain('id="main"');
  });
});
