import { ClientDetailPanel } from "@/components/crm/ClientDetailPanel";

interface Props {
  params: Promise<{ clientId: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const { clientId } = await params;
  return (
    <div className="h-full overflow-hidden rounded-lg border bg-card shadow-sm">
      <ClientDetailPanel clientId={clientId} />
    </div>
  );
}
