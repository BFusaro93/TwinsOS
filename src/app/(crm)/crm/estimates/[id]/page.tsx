import { EstimateDetail } from "@/components/crm/estimates/EstimateDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstimateDetailPage({ params }: Props) {
  const { id } = await params;
  return <EstimateDetail estimateId={id} />;
}
