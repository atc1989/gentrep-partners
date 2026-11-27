import { TenantDetailView } from "@/components/admin/platform";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="cr-page"><TenantDetailView id={id} /></div>;
}
