import { Suspense, type ReactNode } from "react";

export const metadata = { title: "Sign in", robots: { index: false } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="crm"><Suspense>{children}</Suspense></div>;
}
