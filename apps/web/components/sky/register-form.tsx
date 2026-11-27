"use client";
import { cleanText, isEmail, normalizeMobile } from "@gs/api/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, call, messageOf } from "@/lib/api";
import { SkAlert, SkCheck, SkText } from "./fields";

type Errors = Partial<Record<"full_name" | "email" | "mobile" | "city" | "consent", string>>;

/** The registration page form. Same "thank you" whether the email was new or already registered. */
export function RegisterForm({ slug, name }: { slug: string; name: string }) {
  const [f, setF] = useState({ full_name: "", email: "", mobile: "", city: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

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
    if (!consent) next.consent = "Tick the box to confirm, or we cannot register you.";
    setErrors(next);
    setAlert(null);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); // first problem, so a screen reader hears it
      return;
    }

    setBusy(true);
    try {
      await call(api.public.sites({ slug }).registrations.post({ full_name: f.full_name, email: f.email.trim(), mobile: f.mobile, city: f.city, consent: true, website: f.website }));
      setDone(cleanText(f.full_name).split(" ")[0]);
    } catch (err) {
      setAlert(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="sk-status" role="status">
        <h1 className="sk-h3" ref={doneRef} tabIndex={-1}>Thank you, {done}.</h1>
        <p className="sk-body sk-muted">{name} has your details. If you have questions, use the contact details on the home page.</p>
        <Link href="/" className="sk-btn sk-btn--quiet sk-btn--block-phone" style={{ alignSelf: "flex-start" }}>Back to {name}</Link>
      </div>
    );
  }

  return (
    <form className="sk-form" onSubmit={submit} noValidate>
      <div className="sk-status">
        <h1 className="sk-h3">Register with {name}</h1>
        <p className="sk-muted">Four short fields. It takes about a minute.</p>
      </div>
      {alert && <SkAlert tone="error">{alert}</SkAlert>}
      <SkText label="Full name" autoComplete="name" maxLength={100} value={f.full_name} onChange={set("full_name")} error={errors.full_name} />
      <SkText label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} error={errors.email} />
      <SkText label="Mobile number" type="tel" autoComplete="tel" inputMode="tel" hint="Philippine number, like 0917 123 4567" value={f.mobile} onChange={set("mobile")} error={errors.mobile} />
      <SkText label="City" autoComplete="address-level2" maxLength={80} value={f.city} onChange={set("city")} error={errors.city} />
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
      <button type="submit" className="sk-btn sk-btn--primary sk-btn--block-phone" disabled={busy} aria-busy={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Sending…" : <>Register now <span className="sk-chip" aria-hidden><ArrowRight size={20} strokeWidth={1.5} /></span></>}
      </button>
    </form>
  );
}
