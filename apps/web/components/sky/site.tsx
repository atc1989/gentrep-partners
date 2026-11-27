import { ArrowRight, ChevronDown, MessageCircle, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ROOT_DOMAIN } from "@/lib/config";
import { content, heroUrl, logoUrl, socials, themeStyle, type SiteData } from "@/lib/site";
import { NavMenu } from "./nav-menu";

// The public look of a tenant's pages (Sky). Server components: the landing page is rendered on the server and
// the editor preview renders the same components from the form's current values. Tenant text is only ever
// rendered as text, and links are only shown when they are http(s).

const ICONS = { "user-plus": UserPlus, "shield-check": ShieldCheck, "message-circle": MessageCircle } as const;
const rootUrl = () => `${ROOT_DOMAIN.startsWith("localhost") ? "http" : "https"}://${ROOT_DOMAIN}`;

export function SkyRoot({ brandColor, children }: { brandColor: string; children: ReactNode }) {
  return <div className="sky" style={themeStyle(brandColor)}>{children}</div>;
}

function Brand({ site }: { site: SiteData }) {
  const logo = logoUrl(site.settings);
  return (
    <Link href="/" className="sk-brand">
      {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt={site.name} /> : site.name}
    </Link>
  );
}

type NavLink = { href: string; label: string };

function Nav({ site, links, onHero }: { site: SiteData; links: NavLink[]; onHero?: boolean }) {
  const all = [...links, { href: "/registration", label: "Register now" }];
  return (
    <nav className="sk-nav" aria-label="Main">
      <Brand site={site} />
      <div className="sk-nav__links">
        {links.map((l) => <Link key={l.href} href={l.href} className="sk-nav__link">{l.label}</Link>)}
        {onHero ? (
          <Link href="/registration" className="sk-nav__link">Register</Link>
        ) : (
          <Link href="/registration" className="sk-btn sk-btn--primary">Register now</Link>
        )}
      </div>
      <NavMenu links={all} name={site.name} />
    </nav>
  );
}

const Arrow = () => <span className="sk-chip" aria-hidden><ArrowRight size={20} strokeWidth={1.5} /></span>;

export function Footer({ site }: { site: SiteData }) {
  const s = site.settings;
  const social = socials(s);
  return (
    <footer className="sk-footer">
      <div className="sk-footer__top">
        <div>
          <p style={{ color: "#fff", fontSize: 20, fontWeight: 500 }}>{site.name}</p>
          {s.footer_blurb && <p style={{ marginTop: 8, maxWidth: 420 }}>{s.footer_blurb}</p>}
        </div>
        <div>
          <h2>Help</h2>
          <Link href="/registration">Register</Link>
          <Link href="/privacy">Privacy notice</Link>
          {s.contact_email && <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a>}
        </div>
        {social.length > 0 && (
          <div>
            <h2>Follow</h2>
            {social.map(([label, href]) => <a key={label} href={href} rel="noopener noreferrer" target="_blank">{label}</a>)}
          </div>
        )}
      </div>
      <div className="sk-footer__bottom">
        <span>© {new Date().getFullYear()} {site.name}</span>
        <span>Site by <a href={rootUrl()} rel="noopener">Gentrep</a></span>
      </div>
    </footer>
  );
}

/** Registration, privacy and other inner pages: the nav on the page, the content, the footer. */
export function PageFrame({ site, children }: { site: SiteData; children: ReactNode }) {
  return (
    <>
      <header className="sk-wrap"><Nav site={site} links={[]} /></header>
      <main className="sk-wrap sk-main" id="main">{children}</main>
      <Footer site={site} />
    </>
  );
}

export function Landing({ site }: { site: SiteData }) {
  const s = site.settings;
  const c = content(site.name, s);
  const hero = heroUrl(s);
  const logo = logoUrl(s);
  const links: NavLink[] = [
    ...(s.show_features ? [{ href: "#features", label: "Why register" }] : []),
    ...(s.show_faq ? [{ href: "#faq", label: "Questions" }] : []),
    ...(s.show_contact && c.hasContact ? [{ href: "#contact", label: "Contact" }] : []),
  ];
  return (
    <>
      <header className="sk-hero sk-onfill">
        <div className="sk-wrap">
          <Nav site={site} links={links} onHero />
          <div className={`sk-hero__grid${hero ? " has-image" : ""}`}>
            <div className="sk-hero__text">
              <p className="sk-eyebrow">{site.name}</p>
              <h1 className="sk-h1">{c.headline}</h1>
              <p className="sk-lead sk-text">{c.lead}</p>
              <Link href="/registration" className="sk-btn sk-btn--onbrand sk-btn--block-phone">Register now <Arrow /></Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {hero && <img className="sk-hero__img" src={hero} alt="" />}
          </div>
        </div>
      </header>

      <main id="main">
        {s.show_features && (
          <section id="features" className="sk-wrap sk-band" aria-labelledby="features-h">
            <div className="sk-head">
              <p className="sk-eyebrow sk-muted">How it works</p>
              <h2 className="sk-h2" id="features-h">Why register</h2>
            </div>
            <div className="sk-grid3">
              {c.features.map((f) => {
                const Icon = ICONS[f.icon];
                return (
                  <div className="sk-card sk-feature" key={f.title}>
                    <Icon size={28} strokeWidth={1.5} aria-hidden />
                    <h3 className="sk-h3">{f.title}</h3>
                    <p className="sk-muted">{f.text}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {s.show_join && (
          <section className="sk-wrap sk-band" aria-labelledby="join-h">
            <div className={`sk-panel${logo ? " has-image" : ""}`}>
              <div className="sk-panel__text sk-onfill">
                <h2 className="sk-h2" id="join-h">Ready to join?</h2>
                <p className="sk-body sk-text">Registering takes about a minute. Use the button and {site.name} will have your details.</p>
                <Link href="/registration" className="sk-btn sk-btn--onbrand sk-btn--block-phone">Register now <Arrow /></Link>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <div className="sk-panel__img"><img src={logo} alt="" /></div>}
            </div>
          </section>
        )}

        {s.show_faq && (
          <section id="faq" className="sk-wrap sk-band" aria-labelledby="faq-h">
            <div className="sk-head">
              <p className="sk-eyebrow sk-muted">FAQ</p>
              <h2 className="sk-h2" id="faq-h">Questions</h2>
            </div>
            <div className="sk-card sk-faq">
              {c.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q} <ChevronDown size={20} strokeWidth={1.5} aria-hidden /></summary>
                  <div>{f.a}</div>
                </details>
              ))}
            </div>
          </section>
        )}

        {s.show_contact && c.hasContact && (
          <section id="contact" className="sk-wrap sk-band sk-contact" aria-labelledby="contact-h">
            <p className="sk-eyebrow sk-muted">Questions?</p>
            <h2 className="sk-display" id="contact-h">Talk to us.</h2>
            <div className="sk-contact__list">
              {s.contact_email && <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a>}
              {s.contact_phone && <a href={`tel:${s.contact_phone.replace(/[^+\d]/g, "")}`}>{s.contact_phone}</a>}
              {s.contact_address && <span>{s.contact_address}</span>}
            </div>
            <Link href="/registration" className="sk-btn sk-btn--dark sk-btn--block-phone">Register now <Arrow /></Link>
          </section>
        )}
      </main>
      <Footer site={site} />
    </>
  );
}

