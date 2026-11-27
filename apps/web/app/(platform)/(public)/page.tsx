import type { Metadata } from "next";
import { Globe, ListChecks, Palette } from "lucide-react";
import { PlatformFooter, PlatformNav } from "@/components/sky/platform";
import { SignUpForm } from "@/components/sky/signup-form";
import { ROOT_DOMAIN } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: "Gentrep: your own registration site" },
  description: "Create a branded page where your customers, members or resellers register, and an admin to see who signed up.",
};

const FEATURES = [
  { icon: Globe, title: "Your own address", text: `yourname.${ROOT_DOMAIN}, with a landing page and a registration page.` },
  { icon: Palette, title: "Your look", text: "Your logo, your colour and your words on every page." },
  { icon: ListChecks, title: "Your list", text: "See who registered in an admin only you can open. Search it, export it, remove people on request." },
];

export default function Home() {
  return (
    <>
      <header className="sk-hero sk-onfill">
        <div className="sk-wrap">
          <PlatformNav onHero />
          <div className="sk-hero__grid sk-hero__grid--split" style={{ alignItems: "start" }}>
            <div className="sk-hero__text">
              <p className="sk-eyebrow">Gentrep</p>
              <h1 className="sk-h1">Your own site, ready in minutes</h1>
              <p className="sk-lead sk-text">Create a branded page where your customers, members or resellers register. You get an admin to see who signed up.</p>
            </div>
            <div style={{ color: "var(--ink)" }} className="sk-signup-slot"><SignUpForm /></div>
          </div>
        </div>
      </header>
      <main id="main" className="sk-wrap sk-band">
        <div className="sk-grid3">
          {FEATURES.map((f) => (
            <div className="sk-card sk-feature" key={f.title}>
              <f.icon size={28} strokeWidth={1.5} aria-hidden />
              <h2 className="sk-h3">{f.title}</h2>
              <p className="sk-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
      <PlatformFooter />
    </>
  );
}
