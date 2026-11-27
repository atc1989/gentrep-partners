"use client";
import { cleanText, isEmail, NAME_PREFIXES, normalizeMobile, SITE_LIMITS, type SiteSettings } from "@gs/api/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api, call, messageOf } from "@/lib/api";
import { SkAlert, SkCheck, SkSelect, SkText } from "./fields";

type Errors = Partial<Record<"full_name" | "email" | "mobile" | "city" | "category" | "address" | "consent", string>>;
export type RegFields = Pick<SiteSettings, "reg_category_label" | "reg_categories" | "reg_show_address" | "reg_show_source">;

/** Nothing here depends on whether the email was new: no QR, no code. The private link arrives by email. */
export function Thanks({ name, first, email, headingRef }: { name: string; first: string; email: string; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="sk-status" role="status">
      <h1 className="sk-h3" ref={headingRef} tabIndex={-1}>Thank you, {first}.</h1>
      <p className="sk-body sk-muted">{name} has your details. We sent your personal QR link to {email}. Check your inbox and spam folder.</p>
      <p className="sk-body sk-muted">If you have questions, use the contact details on the home page.</p>
      <Link href="/" className="sk-btn sk-btn--quiet sk-btn--block-phone" style={{ alignSelf: "flex-start" }}>Back to {name}</Link>
    </div>
  );
}

/**
 * The registration page form. Same "thank you" whether the email was new or already registered, so the success
 * screen shows nothing that depends on it (no QR, no code): the person's private link arrives by email.
 */
export function RegisterForm({ slug, name, reg, refCode }: { slug: string; name: string; reg: RegFields; refCode?: string }) {
  const [f, setF] = useState({ name_prefix: "", full_name: "", email: "", mobile: "", city: "", category: "", address: "", source: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ first: string; email: string } | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const hasCategory = reg.reg_categories.length > 0;

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const next: Errors = {};
    if (cleanText(f.full_name).length < 2) next.full_name = "Enter your full name.";
    if (!isEmail(f.email.trim())) next.email = "Enter a valid email address, like name@example.com.";
    if (!normalizeMobile(f.mobile)) next.mobile = "Enter a Philippine mobile number, like 0917 123 4567.";
    if (cleanText(f.city).length < 2) next.city = "Enter your city.";
    if (hasCategory && !reg.reg_categories.includes(f.category)) next.category = "Choose one from the list.";
    if (reg.reg_show_address && !cleanText(f.address)) next.address = "Enter your address.";
    if (!consent) next.consent = "Tick the box to confirm, or we cannot register you.";
    setErrors(next);
    setAlert(null);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); // first problem, so a screen reader hears it
      return;
    }

    setBusy(true);
    try {
      await call(
        api.public.sites({ slug }).registrations.post({
          name_prefix: f.name_prefix || undefined,
          full_name: f.full_name,
          email: f.email.trim(),
          mobile: f.mobile,
          city: f.city,
          category: hasCategory ? f.category : undefined,
          address: reg.reg_show_address ? f.address : undefined,
          source: reg.reg_show_source && cleanText(f.source) ? f.source : undefined,
          ref_code: refCode,
          consent: true,
          website: f.website,
        }),
      );
      setDone({ first: cleanText(f.full_name).split(" ")[0], email: f.email.trim() });
    } catch (err) {
      setAlert(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Thanks name={name} first={done.first} email={done.email} headingRef={doneRef} />;

  return (
    <form className="sk-form" onSubmit={submit} noValidate>
      <div className="sk-status">
        <h1 className="sk-h3">Register with {name}</h1>
        <p className="sk-muted">It takes about a minute.</p>
      </div>
      {alert && <SkAlert tone="error">{alert}</SkAlert>}
      <SkSelect label="Title (optional)" autoComplete="honorific-prefix" value={f.name_prefix} onChange={set("name_prefix")} options={NAME_PREFIXES} empty="No title" />
      <SkText label="Full name" autoComplete="name" maxLength={100} value={f.full_name} onChange={set("full_name")} error={errors.full_name} />
      <SkText label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} error={errors.email} />
      <SkText label="Mobile number" type="tel" autoComplete="tel" inputMode="tel" hint="Philippine number, like 0917 123 4567" value={f.mobile} onChange={set("mobile")} error={errors.mobile} />
      <SkText label="City" autoComplete="address-level2" maxLength={80} value={f.city} onChange={set("city")} error={errors.city} />
      {hasCategory && <SkSelect label={reg.reg_category_label || "Category"} value={f.category} onChange={set("category")} options={reg.reg_categories} empty="Choose one" error={errors.category} />}
      {reg.reg_show_address && <SkText label="Address" autoComplete="street-address" maxLength={SITE_LIMITS.address} value={f.address} onChange={set("address")} error={errors.address} />}
      {reg.reg_show_source && <SkText label="Where did you find us? (optional)" maxLength={SITE_LIMITS.source} value={f.source} onChange={set("source")} />}
      {/* Trap field: people never see it, simple bots fill it. */}
      <div className="sk-trap" aria-hidden>
        <label>Leave this field empty <input name="hp_field" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website")(e.target.value)} /></label>
      </div>
      <SkCheck
        checked={consent}
        onChange={setConsent}
        error={errors.consent}
        label={<>I agree that {name} may keep my details to manage my registration, as the <Link href="/privacy" target="_blank" rel="noopener">privacy notice</Link> describes.</>}
      />
      {refCode && <p className="sk-small sk-muted">Ref number #{refCode}</p>}
      <button type="submit" className="sk-btn sk-btn--primary sk-btn--block-phone" disabled={busy} aria-busy={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Sending…" : <>Register now <span className="sk-chip" aria-hidden><ArrowRight size={20} strokeWidth={1.5} /></span></>}
      </button>
    </form>
  );
}
