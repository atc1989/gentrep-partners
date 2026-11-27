import type { Metadata } from "next";
import { ConfirmFlow } from "@/components/sky/auth-flows";
import { PlatformPage } from "@/components/sky/platform";

export const metadata: Metadata = { title: "Confirm", robots: { index: false }, referrer: "no-referrer" };
export default function Confirm() {
  return <PlatformPage><ConfirmFlow /></PlatformPage>;
}
