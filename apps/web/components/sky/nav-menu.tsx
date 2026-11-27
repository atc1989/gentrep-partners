"use client";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

/** The phone menu: a full-screen sheet with 48px rows. Native dialog, so Escape and focus return come for free. */
export function NavMenu({ links, name }: { links: { href: string; label: string }[]; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className="sk-menu-btn" aria-label="Open menu" onClick={() => ref.current?.showModal()}>
        <Menu size={24} strokeWidth={1.5} aria-hidden />
      </button>
      <dialog ref={ref} className="sk-sheet" aria-label={`${name} menu`}>
        <div className="sk-sheet__inner">
          <div className="sk-nav" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="sk-menu-btn" aria-label="Close menu" onClick={close}>
              <X size={24} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="sk-sheet__row" onClick={close}>
              {l.label}
            </Link>
          ))}
        </div>
      </dialog>
    </>
  );
}
