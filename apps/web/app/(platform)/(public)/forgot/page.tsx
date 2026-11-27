import type { Metadata } from "next";
import { ForgotForm } from "@/components/sky/auth-flows";
import { PlatformPage } from "@/components/sky/platform";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };
export default function Forgot() {
  return <PlatformPage><ForgotForm /></PlatformPage>;
}
