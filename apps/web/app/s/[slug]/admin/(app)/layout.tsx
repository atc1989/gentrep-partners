import { Suspense, type ReactNode } from "react";
import { AdminApp } from "@/components/admin/app";

export const metadata = { robots: { index: false } };

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <div className="crm"><Suspense><AdminApp area={{ kind: "tenant", slug }}>{children}</AdminApp></Suspense></div>;
}
