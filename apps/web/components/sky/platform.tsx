import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_DRAFT } from "@/lib/config";

// Platform-wide public pages (Sky, default blue): sign-up, terms, privacy, password reset.

export function PlatformNav({ onHero }: { onHero?: boolean }) {
  return (
    <nav className="sk-nav" aria-label="Main">
      <Link href="/" className="sk-brand">Gentrep</Link>
      <div className="sk-nav__links" style={{ display: "flex" }}>
        {onHero ? <Link href="/admin/login" className="sk-nav__link">Sign in</Link> : <Link href="/admin/login" className="sk-btn sk-btn--quiet">Sign in</Link>}
      </div>
    </nav>
  );
}

export function PlatformFooter() {
  return (
    <footer className="sk-footer">
      <div className="sk-footer__top" style={{ gridTemplateColumns: "1fr" }}>
        <div>
          <p style={{ color: "#fff", fontSize: 20, fontWeight: 500 }}>Gentrep</p>
          <p style={{ marginTop: 8, maxWidth: 420 }}>A branded page where your customers, members or resellers register.</p>
        </div>
        <div>
          <h2>Legal</h2>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy notice</Link>
          <Link href="/admin/login">Sign in</Link>
        </div>
      </div>
      <div className="sk-footer__bottom"><span>© {new Date().getFullYear()} Gentrep</span></div>
    </footer>
  );
}

export function PlatformPage({ children, draft }: { children: ReactNode; draft?: boolean }) {
  return (
    <>
      {draft && LEGAL_DRAFT && <p className="sk-draft" role="note">Draft, not yet reviewed by a lawyer or the data protection officer. It will change before launch.</p>}
      <header className="sk-wrap"><PlatformNav /></header>
      <main className="sk-wrap sk-main" id="main">{children}</main>
      <PlatformFooter />
    </>
  );
}
