"use client";
import { PASSWORD_MAX, PASSWORD_MIN, cleanText, isEmail, isSlug, slugify, type SlugCheck } from "@gs/api/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api, call, messageOf } from "@/lib/api";
import { ROOT_DOMAIN } from "@/lib/config";
import { useDebounced } from "@/lib/hooks";
import { SkAlert, SkBad, SkCheck, SkOk, SkPassword, SkText } from "./fields";

type Errors = Partial<Record<"business" | "slug" | "name" | "email" | "password" | "terms", string>>;

/**
 * Tenant sign-up. The address fills itself from the business name until the person edits it, and is checked live.
 * The answer is always "check your email": the form cannot be used to find out which emails have an account.
 */
export function SignUpForm() {
  const [business, setBusiness] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [check, setCheck] = useState<SlugCheck | { slug: string; status: "unknown" } | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const onBusiness = (v: string) => {
    setBusiness(v);
    if (!slugTouched) setSlug(v.trim() ? slugify(v) : "");
  };

  const debouncedSlug = useDebounced(slug, 400);
  const latest = useRef(0);
  useEffect(() => {
    if (debouncedSlug.length < 1) return setCheck(null);
    const id = ++latest.current;
    call(api.public["slug-check"].get({ query: { slug: debouncedSlug } })).then(
      (r) => id === latest.current && setCheck(r as SlugCheck),
      () => id === latest.current && setCheck({ slug: debouncedSlug, status: "unknown" }), // a failed check says nothing: the server decides on submit
    );
  }, [debouncedSlug]);
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  const slugMessage = () => {
    if (!slug) return null;
    if (check && check.slug === slug && check.status === "unknown") return null;
    if (slug !== debouncedSlug || !check || check.slug !== slug) return <p className="sk-hint" aria-live="polite">Checking…</p>;
    if (check.status === "unknown") return null;
    if (check.status === "available") return <SkOk>{slug}.{ROOT_DOMAIN} is available</SkOk>;
    if (check.status === "taken")
      return (
        <div aria-live="polite">
          <SkBad>That address is taken.</SkBad>
          {check.suggestion && <button type="button" className="sk-link" style={{ background: "none", border: 0, padding: 0, color: "var(--brand-ink)", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setSlug(check.suggestion!); setSlugTouched(true); }}>Use {check.suggestion}</button>}
        </div>
      );
    if (check.status === "reserved") return <SkBad>That address is not available. Choose another.</SkBad>;
    return <SkBad>Use 3 to 40 letters, numbers or hyphens.</SkBad>;
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const next: Errors = {};
    if (cleanText(business).length < 2) next.business = "Enter your business name.";
    if (!isSlug(slug)) next.slug = "Use 3 to 40 letters, numbers or hyphens for the address.";
    else if (check && check.slug === slug && check.status !== "available" && check.status !== "unknown") next.slug = "Choose an address that is available.";
    if (cleanText(name).length < 2) next.name = "Enter your name.";
    if (!isEmail(email.trim())) next.email = "Enter a valid email address, like name@example.com.";
    if (password.length < PASSWORD_MIN) next.password = `Use at least ${PASSWORD_MIN} characters. A passphrase of a few words works well.`;
    else if (password.length > PASSWORD_MAX) next.password = `Use at most ${PASSWORD_MAX} characters.`;
    if (!terms) next.terms = "Tick the box to accept the terms, or we cannot create your site.";
    setErrors(next);
    setAlert(null);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); // first problem, so a screen reader hears it
      return;
    }

    setBusy(true);
    try {
      await call(api.public.tenants.post({ business_name: business, slug, admin_name: name, email: email.trim(), password, accept_terms: true }));
      setSent(email.trim());
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) setErrors({ slug: err.message });
      else setAlert(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="sk-card sk-status" role="status">
        <h2 className="sk-h3" ref={doneRef} tabIndex={-1}>Check your email</h2>
        <p>We sent a link to <strong style={{ overflowWrap: "anywhere" }}>{sent}</strong>. Open it to confirm your email and your site opens. The link works once and expires in 1 hour.</p>
        <p className="sk-hint">Nothing there? Look in spam, or use a different email.</p>
        <button type="button" className="sk-btn sk-btn--quiet sk-btn--block-phone" style={{ alignSelf: "flex-start" }} onClick={() => { setSent(null); setPassword(""); }}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="sk-card sk-form" onSubmit={submit} noValidate id="signup" aria-labelledby="signup-h">
      <h2 className="sk-h3" id="signup-h">Create your site</h2>
      {alert && <SkAlert tone="error">{alert}</SkAlert>}
      <SkText label="Business name" autoComplete="organization" maxLength={80} value={business} onChange={onBusiness} error={errors.business} />
      <SkText
        label="Site address"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={40}
        value={slug}
        onChange={(v) => { setSlug(v.toLowerCase()); setSlugTouched(true); }}
        error={errors.slug}
        hint={slug ? slugMessage() : `Your site will be at name.${ROOT_DOMAIN}`}
      />
      <SkText label="Your name" autoComplete="name" maxLength={100} value={name} onChange={setName} error={errors.name} />
      <SkText label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={setEmail} error={errors.email} />
      <SkPassword label="Password" value={password} onChange={setPassword} error={errors.password} hint={`At least ${PASSWORD_MIN} characters.`} />
      <SkCheck
        checked={terms}
        onChange={setTerms}
        error={errors.terms}
        label={<>I accept the <Link href="/terms" target="_blank" rel="noopener">terms</Link> and have read the <Link href="/privacy" target="_blank" rel="noopener">privacy notice</Link>.</>}
      />
      <button type="submit" className="sk-btn sk-btn--primary sk-btn--block" disabled={busy} aria-busy={busy}>
        {busy ? "Creating…" : <>Create my site <span className="sk-chip" aria-hidden><ArrowRight size={20} strokeWidth={1.5} /></span></>}
      </button>
    </form>
  );
}
