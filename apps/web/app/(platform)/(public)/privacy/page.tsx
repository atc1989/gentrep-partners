import type { Metadata } from "next";
import { PlatformPage } from "@/components/sky/platform";
import { PlatformPrivacyDoc } from "@/components/sky/legal";

export const metadata: Metadata = { title: "Privacy notice" };
export default function Privacy() {
  return <PlatformPage draft><PlatformPrivacyDoc /></PlatformPage>;
}
