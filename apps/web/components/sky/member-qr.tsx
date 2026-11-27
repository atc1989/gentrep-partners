"use client";
import type { MemberCard } from "@gs/api/shared";
import { Check, CircleAlert, Copy, Download, Printer, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, call, messageOf } from "@/lib/api";
import { QrCode, type QrHandle } from "../qr";

type State =
  | { kind: "loading" }
  | { kind: "ok"; card: MemberCard }
  | { kind: "invalid" }
  | { kind: "limited" }
  | { kind: "error"; message: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * "My invite QR". The private token arrives in the address after # (the emailed link), so it never reaches a server
 * log, a referrer or a query string. It is read once, sent in the body of one API call, and kept nowhere else.
 */
export function MemberQr({ slug, name }: { slug: string; name: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const qr = useRef<QrHandle>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    const token = new URLSearchParams(location.hash.slice(1)).get("k") ?? "";
    if (!TOKEN_RE.test(token)) return setState({ kind: "invalid" });
    setState({ kind: "loading" });
    try {
      setState({ kind: "ok", card: await call(api.public.sites({ slug }).card.post({ token })) });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setState(status === 404 ? { kind: "invalid" } : status === 429 ? { kind: "limited" } : { kind: "error", message: messageOf(e) });
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state.kind === "ok") heading.current?.focus(); // announces the page to a screen reader once it is ready
  }, [state.kind]);

  if (state.kind === "loading") {
    return (
      <div className="sk-status" role="status" aria-busy="true">
        <h1 className="sk-h3">Your invite QR</h1>
        <p className="sk-muted">Opening your page…</p>
        <div className="sk-skeleton" aria-hidden />
      </div>
    );
  }

  if (state.kind === "invalid" || state.kind === "limited" || state.kind === "error") {
    const text =
      state.kind === "invalid" ? { h: "This link does not work", p: "It may be incomplete or no longer valid. Open the link from your email again, or register to get a new one." }
      : state.kind === "limited" ? { h: "Too many tries", p: "Wait a minute, then try again." }
      : { h: "We could not open your page", p: state.message };
    return (
      <div className="sk-status" role="status">
        <h1 className="sk-h3" style={{ display: "flex", gap: 8, alignItems: "center" }}><CircleAlert size={24} aria-hidden /> {text.h}</h1>
        <p className="sk-body sk-muted">{text.p}</p>
        <div className="sk-actions">
          {state.kind !== "invalid" && <button type="button" className="sk-btn sk-btn--primary" onClick={() => void load()}>Retry</button>}
          <Link href="/registration" className="sk-btn sk-btn--line">Register</Link>
        </div>
      </div>
    );
  }

  const { member_code: code, invited } = state.card;
  const link = `${location.origin}/j/${code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setNote("Link copied.");
      setTimeout(() => { setCopied(false); setNote(""); }, 2500);
    } catch {
      setNote("Copy is not available here. Select the link and copy it.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: name, text: `Register with ${name}`, url: link });
    } catch {
      /* closed by the person */
    }
  }

  return (
    <div className="sk-status sk-qrcard">
      <h1 className="sk-h3" ref={heading} tabIndex={-1}>Your invite QR</h1>
      <p className="sk-muted sk-noprint">People who scan this register with {name} and are counted as invited by you.</p>
      <p className="sk-printonly sk-body">Scan to register with {name}</p>
      <div className="sk-qr">
        <QrCode ref={qr} value={link} label={`QR code that opens ${name}'s invite link`} filename={`${slug}-invite-qr.png`} size={240} />
      </div>
      <p className="sk-ref">Ref number #{code}</p>
      <p className="sk-linktext">{link}</p>
      <div className="sk-actions sk-noprint">
        <button type="button" className="sk-btn sk-btn--primary" onClick={copy}>
          {copied ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />} {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && <button type="button" className="sk-btn sk-btn--line" onClick={share}><Share2 size={20} aria-hidden /> Share</button>}
        <button type="button" className="sk-btn sk-btn--line" onClick={() => qr.current?.download()}><Download size={20} aria-hidden /> Download PNG</button>
        <button type="button" className="sk-btn sk-btn--line" onClick={() => window.print()}><Printer size={20} aria-hidden /> Print</button>
      </div>
      <p className="sk-small sk-muted sk-noprint" role="status" aria-live="polite">{note}</p>
      <p className="sk-body sk-noprint">
        {invited === 0 ? "No one has joined with your code yet. Share your QR and the first person will show up here."
          : invited === 1 ? "1 person joined with your code."
          : `${invited} people joined with your code.`}
      </p>
    </div>
  );
}
