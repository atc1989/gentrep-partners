import type { Metadata } from "next";
import { PlatformPage } from "@/components/sky/platform";
import { TermsDoc } from "@/components/sky/legal";

export const metadata: Metadata = { title: "Terms of service" };
export default function Terms() {
  return <PlatformPage draft><TermsDoc /></PlatformPage>;
}
