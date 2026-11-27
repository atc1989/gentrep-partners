import { Suspense, type ReactNode } from "react";
import { AdminApp } from "@/components/admin/app";

export const metadata = { robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return <div className="crm"><Suspense><AdminApp area={{ kind: "platform" }}>{children}</AdminApp></Suspense></div>;
}
