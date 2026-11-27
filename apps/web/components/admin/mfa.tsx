"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { Alert, Button, Field, PageTitle } from "../crm";

type Mode = { name: "loading" } | { name: "challenge"; factorId: string } | { name: "enrol"; factorId: string; qr: string; secret: string } | { name: "error"; message: string };

/**
 * Super admin second factor (playbook: 08 - MFA Pattern). A privileged account counts only at aal2, so this is
 * where a new super admin enrols an authenticator app and every later sign-in enters a code.
 * Uses the provider's own MFA calls; nothing here generates or checks a code.
 */
export function MfaFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ name: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // enrolling twice would leave a dead QR code (React dev mode runs effects twice)
    started.current = true;
    (async () => {
      const sb = getSupabase();
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return router.replace("/admin/login");
      const level = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level.data?.currentLevel === "aal2") return router.replace("/admin");
      const { data: f, error: fe } = await sb.auth.mfa.listFactors();
      if (fe) return setMode({ name: "error", message: "Could not check your second factor. Try again." });
      const verified = f.totp[0];
      if (verified) return setMode({ name: "challenge", factorId: verified.id });
      // Remove an abandoned, never-confirmed attempt so a new one can start.
      for (const stale of f.all.filter((x: { id: string; status: string }) => x.status === "unverified")) await sb.auth.mfa.unenroll({ factorId: stale.id });
      const enrol = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app", issuer: "Gentrep" });
      if (enrol.error || !enrol.data) return setMode({ name: "error", message: "Could not start setup. Try again." });
      setMode({ name: "enrol", factorId: enrol.data.id, qr: enrol.data.totp.qr_code, secret: enrol.data.totp.secret });
    })();
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode.name !== "challenge" && mode.name !== "enrol") return;
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: code.trim() });
    if (err) {
      setBusy(false);
      return setError("That code is not right, or it expired. Wait for the next code and try again.");
    }
    router.replace("/admin");
  }

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.replace("/admin/login");
  };

  return (
    <div className="cr-auth">
      <PageTitle>Second factor</PageTitle>
      <div className="cr-auth__card cr-card">
        <div className="cr-card__body cr-section">
          {mode.name === "loading" && <p className="cr-muted" role="status">Loading…</p>}
          {mode.name === "error" && <Alert tone="error" actions={<Button small onClick={() => location.reload()}>Try again</Button>}>{mode.message}</Alert>}
          {(mode.name === "challenge" || mode.name === "enrol") && (
            <form className="cr-section" onSubmit={submit} noValidate>
              <h1 style={{ fontSize: 18, fontWeight: 500 }}>{mode.name === "enrol" ? "Set up your authenticator app" : "Enter your code"}</h1>
              {mode.name === "enrol" ? (
                <>
                  <p className="cr-muted">Scan this with an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code it shows.</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mode.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid var(--border)" }} />
                  <p className="cr-hint">Cannot scan? Enter this key by hand: <code style={{ overflowWrap: "anywhere" }}>{mode.secret}</code></p>
                </>
              ) : (
                <p className="cr-muted">Open your authenticator app and enter the 6-digit code for Gentrep.</p>
              )}
              {error && <Alert tone="error">{error}</Alert>}
              <Field label="6-digit code">
                {(p) => <input className="cr-input tnum" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} {...p} />}
              </Field>
              <Button type="submit" variant="primary" block busy={busy}>{mode.name === "enrol" ? "Turn on and continue" : "Continue"}</Button>
              {mode.name === "challenge" && <p className="cr-hint">Lost your phone? Ask another platform admin or the owner to reset your second factor.</p>}
            </form>
          )}
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
