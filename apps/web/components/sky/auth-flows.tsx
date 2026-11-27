"use client";
import { PASSWORD_MAX, PASSWORD_MIN, cleanText, isEmail, isSlug, type Me, type SlugCheck } from "@gs/api/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api, call, messageOf } from "@/lib/api";
import { ROOT_DOMAIN } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";
import { SkAlert, SkPassword, SkText } from "./fields";

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="sk-card sk-status sk-narrow" style={{ marginTop: 32 }}>
    <h1 className="sk-h3">{title}</h1>
    {children}
  </div>
);

/** Asks for a reset link. Same answer for every email, so it cannot reveal who has an account. */
export function ForgotForm({ slug }: { slug?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email.trim())) return setError("Enter a valid email address, like name@example.com.");
    setBusy(true);
    setError(null);
    try {
      await call(api.public.forgot.post({ email: email.trim(), slug: slug ?? null }));
      setSent(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card title="Check your email">
        <p role="status">If that address has an account, we sent a link to choose a new password. It works once and expires in 1 hour.</p>
        <Link href="/admin/login" className="sk-btn sk-btn--quiet sk-btn--block-phone" style={{ alignSelf: "flex-start" }}>Back to sign in</Link>
      </Card>
    );
  }
  return (
    <form className="sk-card sk-form sk-narrow" style={{ marginTop: 32 }} onSubmit={submit} noValidate>
      <h1 className="sk-h3">Reset your password</h1>
      {error && <SkAlert tone="error">{error}</SkAlert>}
      <SkText label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={setEmail} />
      <button type="submit" className="sk-btn sk-btn--primary sk-btn--block-phone" disabled={busy} aria-busy={busy} style={{ alignSelf: "flex-start" }}>{busy ? "Sending…" : "Send reset link"}</button>
      <Link href="/admin/login" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Back to sign in</Link>
    </form>
  );
}

type Phase =
  | { name: "working" }
  | { name: "bad_link" }
  | { name: "recovery" }
  | { name: "activate"; pending: { slug: string; name: string }; message?: string }
  | { name: "error"; message: string };

/**
 * Where the emailed links land. The token is in the part after # (never sent to a server), is removed from the
 * address bar at once, and works once. Sign-up links open the site; reset links ask for a new password.
 */
export function ConfirmFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "working" });
  const started = useRef(false);

  const openSite = async (slug?: string) => {
    try {
      await call(api.me.activate.post({ slug: slug ?? null }));
      router.replace("/admin");
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const me = (await call(api.me.get())) as Me;
        if (me.pending) return setPhase({ name: "activate", pending: me.pending, message: e.message });
      }
      setPhase({ name: "error", message: messageOf(e) });
    }
  };

  useEffect(() => {
    if (started.current) return; // the link works once: never run twice (React dev mode does)
    started.current = true;
    (async () => {
      const sb = getSupabase();
      const hash = new URLSearchParams(location.hash.slice(1));
      const tokenHash = hash.get("token_hash");
      const type = hash.get("type");
      if (tokenHash && type) {
        history.replaceState(null, "", location.pathname);
        const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as "signup" | "recovery" | "magiclink" | "email" });
        if (error) return setPhase({ name: "bad_link" });
        if (type === "recovery") return setPhase({ name: "recovery" });
        return openSite();
      }
      // No token: a signed-in person with a site still waiting (for example after a taken address) comes back here.
      const { data } = await sb.auth.getSession();
      if (!data.session) return setPhase({ name: "bad_link" });
      const me = (await call(api.me.get())) as Me;
      if (me.tenant) return router.replace("/admin");
      if (me.pending) return setPhase({ name: "activate", pending: me.pending });
      setPhase({ name: "bad_link" });
    })().catch((e) => setPhase({ name: "error", message: messageOf(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.name === "working") return <Card title="One moment"><p role="status">Checking your link…</p></Card>;
  if (phase.name === "bad_link")
    return (
      <Card title="This link has expired">
        <p>The link was already used or is older than 1 hour. Links work once.</p>
        <Link href="/forgot" className="sk-btn sk-btn--primary sk-btn--block-phone" style={{ alignSelf: "flex-start" }}>Get a new link</Link>
      </Card>
    );
  if (phase.name === "error") return <Card title="Something went wrong"><SkAlert tone="error">{phase.message}</SkAlert><button type="button" className="sk-btn sk-btn--quiet" style={{ alignSelf: "flex-start" }} onClick={() => location.reload()}>Try again</button></Card>;
  if (phase.name === "recovery") return <NewPassword />;
  return <ChooseAddress pending={phase.pending} message={phase.message} onOpen={openSite} />;
}

function NewPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters. A passphrase of a few words works well.`);
    if (password.length > PASSWORD_MAX) return setError(`Use at most ${PASSWORD_MAX} characters.`);
    if (password !== again) return setError("The two passwords are not the same.");
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().auth.updateUser({ password });
    if (err) {
      setBusy(false);
      return setError(err.code === "same_password" ? "Choose a password you have not used before." : "We could not save that password. Try a longer one.");
    }
    router.replace("/admin");
  }
  return (
    <form className="sk-card sk-form sk-narrow" style={{ marginTop: 32 }} onSubmit={submit} noValidate>
      <h1 className="sk-h3">Choose a new password</h1>
      {error && <SkAlert tone="error">{error}</SkAlert>}
      <SkPassword label="New password" value={password} onChange={setPassword} hint={`At least ${PASSWORD_MIN} characters.`} />
      <SkPassword label="Repeat the password" value={again} onChange={setAgain} />
      <button type="submit" className="sk-btn sk-btn--primary sk-btn--block-phone" disabled={busy} aria-busy={busy} style={{ alignSelf: "flex-start" }}>{busy ? "Saving…" : "Save password and continue"}</button>
    </form>
  );
}

/** Shown only when the address chosen at sign-up was taken meanwhile: pick another and open the site. */
function ChooseAddress({ pending, message, onOpen }: { pending: { slug: string; name: string }; message?: string; onOpen: (slug?: string) => Promise<void> }) {
  const [slug, setSlug] = useState(pending.slug);
  const [check, setCheck] = useState<SlugCheck | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isSlug(slug)) return setCheck(null);
    const t = setTimeout(() => call(api.public["slug-check"].get({ query: { slug } })).then((r) => setCheck(r as SlugCheck), () => setCheck(null)), 400);
    return () => clearTimeout(t);
  }, [slug]);
  const problem = check && check.slug === slug && check.status !== "available" ? (check.status === "taken" ? "That address is taken." : "That address is not available.") : !isSlug(slug) ? "Use 3 to 40 letters, numbers or hyphens." : null;
  return (
    <form className="sk-card sk-form sk-narrow" style={{ marginTop: 32 }} onSubmit={async (e) => { e.preventDefault(); if (problem) return; setBusy(true); await onOpen(slug); setBusy(false); }} noValidate>
      <h1 className="sk-h3">Open {cleanText(pending.name)}</h1>
      {message && <SkAlert tone="error">{message}</SkAlert>}
      <SkText label="Site address" autoCapitalize="none" spellCheck={false} value={slug} onChange={(v) => setSlug(v.toLowerCase())} error={problem} hint={`${slug || "name"}.${ROOT_DOMAIN}`} />
      <button type="submit" className="sk-btn sk-btn--primary sk-btn--block-phone" disabled={busy} aria-busy={busy} style={{ alignSelf: "flex-start" }}>{busy ? "Opening…" : "Open my site"}</button>
    </form>
  );
}
