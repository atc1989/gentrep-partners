import { Landing } from "@/components/sky/site";
import { getSite } from "@/lib/server";

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const site = await getSite(slug);
  if (!site || site.status !== "active") return null; // the layout has already shown why
  return <Landing site={{ name: site.name, slug: site.slug, settings: site.settings }} />;
}
