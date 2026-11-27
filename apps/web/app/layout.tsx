import type { Metadata } from "next";
import { Inter, Instrument_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sky = Instrument_Sans({ subsets: ["latin"], variable: "--font-sky", display: "swap" });

// Every page sets its own title (playbook: UX Principles, Accessibility). Admin pages are noindex.
export const metadata: Metadata = { title: { default: "Gentrep", template: "%s · Gentrep" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sky.variable}`}>
      <body>{children}</body>
    </html>
  );
}
