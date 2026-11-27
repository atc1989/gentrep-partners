import { t } from "elysia";
import { INVITE_CODE_RE, NAME_PREFIXES, PASSWORD_MAX, PASSWORD_MIN, SITE_LIMITS } from "./shared";

// TypeBox building blocks. Every body uses additionalProperties: false, so a client can never smuggle in
// `role`, `tenant_id` or `status`. (playbook: 01 - Security Baseline, "Input")

export const Uuid = t.String({ format: "uuid" });
export const Text = (max: number, min = 0) => t.String({ minLength: min, maxLength: max });
export const Maybe = <T extends Parameters<typeof t.Nullable>[0]>(schema: T) => t.Nullable(schema);
export const Body = <T extends Parameters<typeof t.Object>[0]>(props: T) => t.Object(props, { additionalProperties: false });

export const SlugParam = t.String({ pattern: "^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$" });
export const Page = t.Optional(t.Numeric({ minimum: 1, maximum: 10000 }));

const Url = Maybe(t.String({ maxLength: 300, pattern: "^https?://\\S+$" }));
const Path = Maybe(t.String({ maxLength: 120, pattern: "^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(png|jpg|webp)$" }));

/** Whole-form save: every key is required (null clears it), so an omitted key can never wipe a field by accident. */
export const SiteBody = Body({
  brand_color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  logo_path: Path,
  favicon_path: Path,
  hero_image_path: Path,
  hero_headline: Maybe(Text(SITE_LIMITS.hero_headline)),
  hero_text: Maybe(Text(SITE_LIMITS.hero_text)),
  contact_email: Maybe(t.String({ maxLength: 120, pattern: "^[^@\\s?&%/]+@[^@\\s?&%/]+\\.[^@\\s?&%/]+$" })),
  contact_phone: Maybe(t.String({ pattern: "^[-0-9+() ]{5,30}$" })),
  contact_address: Maybe(Text(SITE_LIMITS.contact_address)),
  facebook_url: Url,
  instagram_url: Url,
  tiktok_url: Url,
  youtube_url: Url,
  footer_blurb: Maybe(Text(SITE_LIMITS.footer_blurb)),
  seo_title: Maybe(Text(SITE_LIMITS.seo_title)),
  seo_description: Maybe(Text(SITE_LIMITS.seo_description)),
  show_features: t.Boolean(),
  show_join: t.Boolean(),
  show_faq: t.Boolean(),
  show_contact: t.Boolean(),
  reg_category_label: Text(SITE_LIMITS.reg_category_label, 1),
  reg_categories: t.Array(Text(SITE_LIMITS.reg_category, 1), { maxItems: SITE_LIMITS.reg_categories }),
  reg_show_address: t.Boolean(),
  reg_show_source: t.Boolean(),
});

/** What the registration form may send besides the four old fields. All optional; null and absent mean the same. */
export const MemberFields = {
  name_prefix: t.Optional(Maybe(t.String({ pattern: `^(${NAME_PREFIXES.map((p) => p.replace(".", "\\.")).join("|")})$` }))),
  category: t.Optional(Maybe(Text(SITE_LIMITS.reg_category))),
  address: t.Optional(Maybe(Text(SITE_LIMITS.address))),
  source: t.Optional(Maybe(Text(SITE_LIMITS.source))),
  ref_code: t.Optional(Maybe(t.String({ pattern: INVITE_CODE_RE.source }))),
};

export const Password = t.String({ minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX });
export const EmailField = t.String({ maxLength: 254, pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" });
