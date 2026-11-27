"use client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { Alert, Button, Field, PageTitle } from "../crm";

const REASONS: Record<string, string> = {
  not_platform: "This sign-in is for the platform team. Use your own site's address to sign in.",
  wrong_site: "That account belongs to a different site. Use the address of your own site.",
};

/** Email and password for both admin areas. A wrong email and a wrong password get the same sentence. */
export function LoginForm({ title }: { title: string }) {
  const router = useRouter();
  const reason = REASONS[useSearchParams().get("reason") ?? ""];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (err) {
      setBusy(false);
      if (err.code === "email_not_confirmed") return setError("Confirm your email first: open the link we sent you.");
      if (err.status === 429) return setError("Too many tries. Wait a minute and try again.");
      if (!err.status || err.status >= 500) return setError("We could not reach the server. Check your connection and try again.");
      return setError("That email and password do not match. Try again, or reset your password.");
    }
    router.replace("/admin");
  }

  return (
    <div className="cr-auth">
      <PageTitle>Sign in</PageTitle>
      <div className="cr-auth__card cr-card">
        <form className="cr-card__body cr-section" onSubmit={submit} noValidate>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{title}</h1>
          {reason && <Alert tone="warn">{reason}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email">{(p) => <input className="cr-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} {...p} />}</Field>
          <Field label="Password">
            {(p) => (
              <div style={{ position: "relative" }}>
                <input className="cr-input" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 48 }} {...p} />
                <button type="button" className="cr-btn cr-btn--ghost" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((s) => !s)} style={{ position: "absolute", right: 0, top: 0, width: 44, padding: 0 }}>
                  {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            )}
          </Field>
          <Button type="submit" variant="primary" block busy={busy}>Sign in</Button>
          <Link href="/forgot" className="cr-muted" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Forgot your password?</Link>
        </form>
      </div>
    </div>
  );
}
