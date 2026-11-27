// Pure helpers used by both the API and the web app. No env, no I/O, no framework imports.

export const NOTICE_VERSION = "2026-11-26b-draft"; // bumped: the form now asks for more, and the notice says why
export const PASSWORD_MIN = 15; // playbook: 02 - Auth and Roles (password is the only proof for tenant admins)
export const PASSWORD_MAX = 200;

// ---- slug -------------------------------------------------------------------------------------

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const isSlug = (s: string) => SLUG_RE.test(s) && !s.includes("--");

/** "Juan's Health Shop" -> "juans-health-shop". Always returns something that passes isSlug. */
export function slugify(name: string): string {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (!s) s = "my-site";
  if (s.length < 3) s = `${s}-site`;
  return s;
}

// ---- people -----------------------------------------------------------------------------------

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL_RE.test(s);

/** The titles the registration form offers. The same list is a table check in the database. */
export const NAME_PREFIXES = ["Mr.", "Ms.", "Mrs.", "Mx.", "Dr.", "Dra.", "Prof.", "Atty."] as const;

/** An invite code is 6 digits, never starting with 0. It is printed in the invite link and the QR. */
export const INVITE_CODE_RE = /^[1-9][0-9]{5}$/;

/** 09171234567, +639171234567, 639171234567 and spaced or dashed versions -> +639171234567. Null if not a PH mobile. */
export function normalizeMobile(input: string): string | null {
  const s = input.replace(/[\s().-]/g, "");
  if (/^09\d{9}$/.test(s)) return `+63${s.slice(1)}`;
  if (/^\+639\d{9}$/.test(s)) return s;
  if (/^639\d{9}$/.test(s)) return `+${s}`;
  return null;
}
/** +639171234567 -> 0917 123 4567, for screens. */
export const showMobile = (m: string) => (/^\+639\d{9}$/.test(m) ? `0${m.slice(3, 6)} ${m.slice(6, 9)} ${m.slice(9)}` : m);

/** Trim, drop control characters, collapse runs of spaces. */
export const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Only http(s) links are shown. Never javascript: or data:. (playbook: 01 - Security Baseline, "Input") */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// ---- site content ----------------------------------------------------------------------------

export type SiteSettings = {
  brand_color: string;
  logo_path: string | null;
  favicon_path: string | null;
  hero_image_path: string | null;
  hero_headline: string | null;
  hero_text: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  footer_blurb: string | null;
  seo_title: string | null;
  seo_description: string | null;
  show_features: boolean;
  show_join: boolean;
  show_faq: boolean;
  show_contact: boolean;
  // The registration form. An empty category list switches the category field off.
  reg_category_label: string;
  reg_categories: string[];
  reg_show_address: boolean;
  reg_show_source: boolean;
};

export type PublicSite = { status: "active"; slug: string; name: string; settings: SiteSettings } | { status: "suspended" };

export const SITE_LIMITS = {
  hero_headline: 80,
  hero_text: 300,
  contact_address: 200,
  footer_blurb: 300,
  seo_title: 70,
  seo_description: 160,
  reg_category_label: 40,
  reg_categories: 20, // options in the list
  reg_category: 60, // characters in one option
  address: 200,
  source: 120,
} as const;

// ---- colour: one brand colour per tenant, made readable --------------------------------------

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const mix = (hex: string, target: string, t: number) => {
  const [a, b] = [toRgb(hex), toRgb(target)];
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb);
};

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const PAGE_GRAY = "#f2f2f2"; // Sky --page
export const INK = "#1f1f1f"; // Sky --ink

export type Theme = { brand: string; hover: string; pale: string; adjusted: boolean };

/**
 * One colour in, a readable set out. White text must reach 5:1 on the brand and the brand itself must
 * reach 4.5:1 as text on the gray page, or the colour is darkened step by step. Hover is a darker
 * shade (lighter for near-black). Pale is a 75% tint for the panel, where text is ink.
 * Playbook: Sky 01 - UI Rules, rules 1 and 2; UX Principles, "brand carries white text at 4.5:1".
 */
export function deriveTheme(input: string | null | undefined): Theme {
  let brand = input && HEX_RE.test(input) ? input.toLowerCase() : "#0068d0";
  let adjusted = false;
  for (let i = 0; i < 60 && (contrast("#ffffff", brand) < 5 || contrast(PAGE_GRAY, brand) < 4.5); i++) {
    brand = mix(brand, "#000000", 0.06);
    adjusted = true;
  }
  const hover = luminance(brand) < 0.03 ? mix(brand, "#ffffff", 0.18) : mix(brand, "#000000", 0.2);
  const pale = mix(brand, "#ffffff", 0.75);
  return { brand, hover, pale, adjusted };
}

// ---- csv --------------------------------------------------------------------------------------

/**
 * One CSV cell. A text cell that starts with = + @ tab or CR gets a leading quote so Excel does not run it;
 * so does a leading "-", unless the whole cell is a plain negative number. (playbook: 01 - Security Baseline, "Files and exports")
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+@\t\r]/.test(s) || (s.startsWith("-") && !/^-\d+(\.\d+)?$/.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

// ---- response shapes (what the SQL functions return) -----------------------------------------

export type Paged<T> = { rows: T[]; total: number; page: number; page_size: number };
export type TenantStatus = "active" | "suspended";
export type TenantBrief = { id: string; slug: string; name: string; status: TenantStatus };

export type Me = {
  user_id: string;
  aal: "aal1" | "aal2";
  platform_admin: boolean;
  tenant: TenantBrief | null;
  pending: { slug: string; name: string; admin_name: string } | null;
};
export type AdminSite = { tenant: TenantBrief; settings: SiteSettings };
export type Registration = {
  id: string;
  name_prefix: string | null;
  full_name: string;
  email: string;
  mobile: string;
  city: string;
  category: string | null;
  address: string | null;
  source: string | null;
  member_type: string;
  member_code: number;
  created_at: string;
  referred_by_code: number | null;
  referred_by_name: string | null;
};
/** What a person sees on their own invite page: their code and how many people joined with it. Nothing else. */
export type MemberCard = { member_code: number; invited: number };
export type TenantRow = TenantBrief & { created_at: string; admin_email: string | null; registrations: number };
export type TenantDetail = TenantBrief & {
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
  registrations: number;
  support_expires_at: string | null;
};
export type AuditRow = {
  id: number;
  at: string;
  actor_kind: "tenant_admin" | "platform_admin" | "system";
  action: string;
  detail: Record<string, unknown>;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  actor_email?: string | null;
};
export type SlugCheck = { slug: string; status: "available" | "taken" | "reserved" | "invalid"; suggestion: string | null };
