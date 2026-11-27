"use client";
import { deriveTheme, HEX_RE, isEmail, SITE_LIMITS, type AdminSite, type SiteSettings } from "@gs/api/shared";
import { CircleCheck, Clock, Eye, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { messageOf } from "@/lib/api";
import { imageUrl } from "@/lib/config";
import { useLoad } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase";
import { Alert, Button, Check, Field, LoadView, TextArea, TextField } from "../crm";
import { Landing, SkyRoot } from "../sky/site";
import { optionsError, optionsToText, parseOptions } from "./reg-options";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
const URL_RE = /^https?:\/\/\S+$/;
const PHONE_RE = /^[-0-9+() ]{5,30}$/;

/** What the file really is, from its first bytes. The name and the browser's type are not trusted. */
async function sniff(file: File): Promise<keyof typeof TYPES | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return null;
}

function ImageField({ label, hint, value, tenantId, onChange }: { label: string; hint: string; value: string | null; tenantId: string; onChange: (path: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = imageUrl(value);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) return setError("That file is over 2 MB. Choose a smaller picture.");
    const kind = await sniff(file);
    if (!kind) return setError("That is not a PNG, JPEG or WEBP picture. Choose another file.");
    setBusy(true);
    const path = `${tenantId}/${crypto.randomUUID()}.${kind}`;
    const { error: err } = await getSupabase().storage.from("brand").upload(path, file, { contentType: TYPES[kind], cacheControl: "31536000", upsert: false });
    setBusy(false);
    if (err) return setError("The upload did not work. Check your connection and try again.");
    onChange(path);
  }

  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {src && /* eslint-disable-next-line @next/next/no-img-element */ <img className="cr-thumb" src={src} alt="" />}
          <input className="cr-input" style={{ flex: "1 1 200px", width: "auto" }} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} {...p} />
          {busy && <span className="cr-muted" role="status">Uploading…</span>}
          {value && !busy && <Button small onClick={() => onChange(null)}><X size={14} aria-hidden /> Remove</Button>}
        </div>
      )}
    </Field>
  );
}

/** The real landing page, drawn from the form's values. Inert: nothing in it can be focused or followed. */
function Preview({ name, slug, settings }: { name: string; slug: string; settings: SiteSettings }) {
  return (
    <div inert aria-hidden>
      <SkyRoot brandColor={settings.brand_color}>
        <Landing site={{ name, slug, settings }} />
      </SkyRoot>
    </div>
  );
}

/** A 1280px-wide page shrunk to fit the box it is in. */
function InlinePreview(props: { name: string; slug: string; settings: SiteSettings }) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.clientWidth && setZoom(el.clientWidth / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="cr-preview hidden min-[1100px]:block">
      <div className="cr-preview__bar"><span>Preview</span><span>Your page on a computer</span></div>
      <div className="cr-preview__frame" ref={frame}>
        <div style={{ width: 1280, zoom }}><Preview {...props} /></div>
      </div>
    </div>
  );
}

function PreviewDialog({ open, onClose, ...props }: { open: boolean; onClose: () => void; name: string; slug: string; settings: SiteSettings }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-label="Preview of your page" onClose={onClose} style={{ width: "100vw", height: "100dvh", maxWidth: "100vw", maxHeight: "100dvh", margin: 0, padding: 0, border: 0, background: "var(--background)", color: "var(--foreground)" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="cr-preview__bar" style={{ minHeight: 56 }}>
          <span>Preview</span>
          <Button onClick={onClose}><X size={16} aria-hidden /> Close</Button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{open && <Preview {...props} />}</div>
      </div>
    </dialog>
  );
}

const count = (v: string | null, max: number) => `${(v ?? "").length} of ${max} characters`;
const LIMIT = SITE_LIMITS;

type TextKey = { [K in keyof SiteSettings]: SiteSettings[K] extends string | null ? K : never }[keyof SiteSettings];
const SOCIAL = [["facebook_url", "Facebook"], ["instagram_url", "Instagram"], ["tiktok_url", "TikTok"], ["youtube_url", "YouTube"]] as const;
const SECTIONS = [
  ["show_features", "Why register", "Three short reasons to register."],
  ["show_join", "Ready to join?", "A second call to register, with your logo."],
  ["show_faq", "Questions", "Common questions and answers."],
  ["show_contact", "Contact details", "Only shows when you have added an email, phone or address."],
] as const;

/** Whole-form save: every field is sent. Empty text becomes null, except the category label (always text) and the options (a list). */
const normalize = (s: SiteSettings): SiteSettings => {
  const out = { ...s, brand_color: s.brand_color.toLowerCase() };
  for (const k of Object.keys(out) as (keyof SiteSettings)[]) {
    const v = out[k];
    if (typeof v === "string" && k !== "brand_color" && k !== "reg_category_label") (out as Record<string, unknown>)[k] = v.trim() || null;
  }
  out.reg_category_label = s.reg_category_label.trim();
  out.reg_categories = s.reg_categories.map((o) => o.trim()).filter(Boolean);
  return out;
};

function Editor({ data, save }: { data: AdminSite; save: (settings: SiteSettings) => Promise<unknown> }) {
  const { tenant } = data;
  const [form, setForm] = useState(data.settings);
  const [hex, setHex] = useState(data.settings.brand_color);
  const [options, setOptions] = useState(() => optionsToText(data.settings.reg_categories));
  const [baseline, setBaseline] = useState(() => JSON.stringify(data.settings));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault(); // closing or reloading with unsaved edits asks first
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const text = (k: TextKey) => ({ value: form[k] ?? "", onChange: (v: string) => set(k, v === "" ? null : v) });
  const theme = deriveTheme(form.brand_color);

  const errors: Partial<Record<keyof SiteSettings | "hex", string>> = {};
  if (!HEX_RE.test(hex)) errors.hex = "Enter a colour like #0068d0, with six letters or digits after the #.";
  if (form.contact_email && !(isEmail(form.contact_email.trim()) && !/[?&%/]/.test(form.contact_email))) errors.contact_email = "Enter an email like name@example.com.";
  if (form.contact_phone && !PHONE_RE.test(form.contact_phone.trim())) errors.contact_phone = "Use 5 to 30 digits, spaces, + - or brackets.";
  if (!form.reg_category_label.trim()) errors.reg_category_label = "Enter a name for the category field, for example Specialty.";
  const optionsProblem = optionsError(form.reg_categories);
  if (optionsProblem) errors.reg_categories = optionsProblem;
  for (const [k] of SOCIAL) if (form[k] && !URL_RE.test(form[k].trim())) errors[k] = "Start the link with http:// or https://, for example https://facebook.com/yourpage.";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length) return setSaveError("Fix the fields marked above, then save again.");
    setBusy(true);
    setSaveError(null);
    const sent = form;
    const next = normalize(form);
    try {
      await save(next);
      setForm((cur) => (cur === sent ? next : cur)); // keep anything typed while the save was in flight
      setBaseline(JSON.stringify(next));
      setSaved(true);
    } catch (err) {
      setSaveError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const preview = { name: tenant.name, slug: tenant.slug, settings: form };
  return (
    <div className="cr-editor">
      <form className="cr-section" style={{ gap: 16 }} onSubmit={submit} noValidate>
        <Button className="cr-previewbtn" onClick={() => setPreviewOpen(true)}><Eye size={16} aria-hidden /> Preview</Button>

        <section className="cr-card" aria-labelledby="ed-brand"><div className="cr-card__body cr-section">
          <h2 id="ed-brand">Brand</h2>
          <ImageField label="Logo" hint="PNG, JPEG or WEBP, up to 2 MB." value={form.logo_path} tenantId={tenant.id} onChange={(p) => set("logo_path", p)} />
          <ImageField label="Favicon" hint="The small icon in the browser tab. A square picture works best." value={form.favicon_path} tenantId={tenant.id} onChange={(p) => set("favicon_path", p)} />
          <Field label="Brand colour" error={errors.hex}>
            {(p) => (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input className="cr-color" type="color" aria-label="Pick the brand colour" value={form.brand_color} onChange={(e) => { setHex(e.target.value); set("brand_color", e.target.value); }} />
                <input className="cr-input" style={{ maxWidth: 140 }} value={hex} maxLength={7} spellCheck={false} autoComplete="off" onChange={(e) => { setHex(e.target.value); if (HEX_RE.test(e.target.value)) set("brand_color", e.target.value.toLowerCase()); }} {...p} />
                <span aria-hidden style={{ width: 36, height: 36, flex: "none", borderRadius: 6, border: "1px solid var(--border)", background: theme.brand }} />
                <span className="cr-hint tnum">Shown as {theme.brand}</span>
              </div>
            )}
          </Field>
          {theme.adjusted && <p className="cr-hint">We darkened this colour so white text stays readable.</p>}
        </div></section>

        <section className="cr-card" aria-labelledby="ed-hero"><div className="cr-card__body cr-section">
          <h2 id="ed-hero">Hero</h2>
          <TextField label="Headline" hint={count(form.hero_headline, LIMIT.hero_headline)} maxLength={LIMIT.hero_headline} placeholder={`Join ${tenant.name}`} {...text("hero_headline")} />
          <TextArea label="Text under the headline" hint={count(form.hero_text, LIMIT.hero_text)} maxLength={LIMIT.hero_text} {...text("hero_text")} />
          <ImageField label="Hero image" hint="Shown beside the headline. PNG, JPEG or WEBP, up to 2 MB." value={form.hero_image_path} tenantId={tenant.id} onChange={(p) => set("hero_image_path", p)} />
        </div></section>

        <section className="cr-card" aria-labelledby="ed-contact"><div className="cr-card__body cr-section">
          <h2 id="ed-contact">Contact</h2>
          <TextField label="Email" type="email" autoComplete="off" maxLength={120} error={errors.contact_email} {...text("contact_email")} />
          <TextField label="Phone" type="tel" autoComplete="off" maxLength={30} error={errors.contact_phone} {...text("contact_phone")} />
          <TextArea label="Address" hint={count(form.contact_address, LIMIT.contact_address)} maxLength={LIMIT.contact_address} {...text("contact_address")} />
        </div></section>

        <section className="cr-card" aria-labelledby="ed-social"><div className="cr-card__body cr-section">
          <h2 id="ed-social">Social links</h2>
          {SOCIAL.map(([k, label]) => <TextField key={k} label={label} type="url" autoComplete="off" maxLength={300} placeholder="https://" error={errors[k]} {...text(k)} />)}
        </div></section>

        <section className="cr-card" aria-labelledby="ed-footer"><div className="cr-card__body cr-section">
          <h2 id="ed-footer">Footer and search</h2>
          <TextArea label="Footer text" hint={count(form.footer_blurb, LIMIT.footer_blurb)} maxLength={LIMIT.footer_blurb} {...text("footer_blurb")} />
          <TextField label="Page title in search results" hint={count(form.seo_title, LIMIT.seo_title)} maxLength={LIMIT.seo_title} placeholder={tenant.name} {...text("seo_title")} />
          <TextArea label="Page description in search results" hint={count(form.seo_description, LIMIT.seo_description)} maxLength={LIMIT.seo_description} {...text("seo_description")} />
        </div></section>

        <section className="cr-card" aria-labelledby="ed-reg"><div className="cr-card__body cr-section">
          <h2 id="ed-reg">Registration form</h2>
          <TextField label="Category field label" hint="e.g. Specialty, Branch, Team" maxLength={LIMIT.reg_category_label} error={errors.reg_category_label} value={form.reg_category_label} onChange={(v) => set("reg_category_label", v)} />
          <TextArea
            label="Category options"
            hint={`${form.reg_categories.length} of ${LIMIT.reg_categories} options. One option per line. Leave it empty to hide the category field.`}
            error={errors.reg_categories}
            rows={6}
            spellCheck={false}
            value={options}
            onChange={(v) => { setOptions(v); set("reg_categories", parseOptions(v)); }}
          />
          <Check label="Ask for address (required when on)" checked={form.reg_show_address} onChange={(v) => set("reg_show_address", v)} />
          <Check label="Ask where they found you (optional when on)" checked={form.reg_show_source} onChange={(v) => set("reg_show_source", v)} />
        </div></section>

        <section className="cr-card" aria-labelledby="ed-sections"><div className="cr-card__body cr-section">
          <h2 id="ed-sections">Sections</h2>
          {SECTIONS.map(([k, label, hint]) => <Check key={k} label={label} hint={hint} checked={form[k]} onChange={(v) => set(k, v)} />)}
        </div></section>

        <div className="cr-section">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <Button type="submit" variant="primary" busy={busy}>Save changes</Button>
            <span className="cr-statusline" role="status">
              {dirty ? <><Clock size={14} aria-hidden /> Unsaved changes</> : saved ? <><CircleCheck size={14} aria-hidden /> Saved just now</> : null}
            </span>
          </div>
          <p className="cr-hint">Saving makes the change live on your site at once.</p>
          {saveError && <Alert tone="error">{saveError}</Alert>}
        </div>
      </form>

      <InlinePreview {...preview} />
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} {...preview} />
    </div>
  );
}

export function SiteEditor({ load, save }: { load: () => Promise<AdminSite>; save: (settings: SiteSettings) => Promise<unknown> }) {
  const state = useLoad(load, []);
  return <LoadView state={state}>{(data) => <Editor data={data} save={save} />}</LoadView>;
}
