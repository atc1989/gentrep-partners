"use client";
import type { Me } from "@gs/api/shared";
import { Activity, Building2, ListChecks, LogOut, Settings, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, call, messageOf } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { Alert, Button } from "../crm";

export type Area = { kind: "platform" } | { kind: "tenant"; slug: string };

const MeContext = createContext<{ me: Me; area: Area; signOut: () => Promise<void> } | null>(null);
export const useAdmin = () => {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useAdmin outside AdminApp");
  return ctx;
};

type Phase = { name: "loading" } | { name: "ready"; me: Me } | { name: "blocked"; title: string; body: string } | { name: "error"; message: string };

const NAV: Record<Area["kind"], { href: string; label: string; icon: LucideIcon; exact?: boolean }[]> = {
  platform: [
    { href: "/admin", label: "Tenants", icon: Building2, exact: true },
    { href: "/admin/reserved", label: "Reserved", icon: ListChecks },
    { href: "/admin/audit", label: "Audit log", icon: Activity },
    { href: "/admin/account", label: "Account", icon: Settings },
  ],
  tenant: [
    { href: "/admin", label: "Registrations", icon: Users, exact: true },
    { href: "/admin/site", label: "Site", icon: Building2 },
    { href: "/admin/account", label: "Account", icon: Settings },
  ],
};

/**
 * The sign-in gate for the admin screens. A convenience only: it sends the wrong person to the right screen.
 * Data is protected by the API and the database, which check the caller on every request.
 */
export function AdminApp({ area, children }: { area: Area; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.replace("/admin/login");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (!data.session) return router.replace("/admin/login");
      let me: Me;
      try {
        me = (await call(api.me.get())) as Me;
      } catch (e) {
        if (!cancelled) setPhase({ name: "error", message: messageOf(e) });
        return;
      }
      if (cancelled) return;
      if (area.kind === "platform") {
        if (!me.platform_admin) {
          await sb.auth.signOut();
          return router.replace("/admin/login?reason=not_platform");
        }
        if (me.aal !== "aal2") return router.replace("/admin/mfa");
      } else {
        if (!me.tenant && me.pending) return router.replace("/auth/confirm");
        if (!me.tenant || me.tenant.slug !== area.slug) {
          await sb.auth.signOut();
          return router.replace("/admin/login?reason=wrong_site");
        }
        if (me.tenant.status === "suspended") {
          return setPhase({ name: "blocked", title: "This site is suspended", body: "Contact the platform team to open it again. Nothing has been deleted." });
        }
      }
      setPhase({ name: "ready", me });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.name === "loading") return <div className="cr-auth"><p className="cr-muted" role="status">Loading…</p></div>;
  if (phase.name === "error") {
    return (
      <div className="cr-auth">
        <div className="cr-auth__card">
          <Alert tone="error" title="Could not open the admin" actions={<Button small onClick={() => location.reload()}>Try again</Button>}>{phase.message}</Alert>
        </div>
      </div>
    );
  }
  if (phase.name === "blocked") {
    return (
      <div className="cr-auth">
        <div className="cr-auth__card cr-section">
          <Alert tone="warn" title={phase.title}>{phase.body}</Alert>
          <Button onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  const nav = NAV[area.kind];
  const active = (n: (typeof nav)[number]) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));
  const contextName = area.kind === "platform" ? "Platform" : phase.me.tenant?.name ?? "";
  return (
    <MeContext.Provider value={{ me: phase.me, area, signOut }}>
      <div className="cr-shell">
        <header className="cr-top">
          <span className="cr-top__title">Gentrep <span className="cr-muted" style={{ fontWeight: 400 }}>· {contextName}</span></span>
          <Button variant="ghost" onClick={signOut} aria-label="Sign out"><LogOut size={16} aria-hidden /> <span className="hidden sm:inline">Sign out</span></Button>
        </header>
        <nav className="cr-side" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="cr-nav" aria-current={active(n) ? "page" : undefined}>
              <n.icon size={18} strokeWidth={1.5} aria-hidden /> {n.label}
            </Link>
          ))}
        </nav>
        <main className="cr-main">{children}</main>
        <nav className="cr-tabbar" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="cr-tab" aria-current={active(n) ? "page" : undefined}>
              <n.icon size={20} strokeWidth={1.5} aria-hidden /> {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}
