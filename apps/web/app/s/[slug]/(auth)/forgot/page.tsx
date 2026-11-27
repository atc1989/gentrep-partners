import type { Metadata } from "next";
import { ForgotForm } from "@/components/sky/auth-flows";
import { PlatformPage } from "@/components/sky/platform";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };
export default async function Forgot({ params }: { params: Promise<{ slug: string }> }) {
  return <PlatformPage><ForgotForm slug={(await params).slug} /></PlatformPage>;
}
