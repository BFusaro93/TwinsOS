import { EstimateDetail } from "@/components/crm/estimates/EstimateDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstimateDetailPage({ params }: Props) {
  const { id } = await params;
  // Break out of main's padding so EstimateDetail gets a clean full-height context
  return (
    <div className="-m-4 md:-m-6 h-[calc(100vh-3.5rem)] overflow-hidden">
      <EstimateDetail estimateId={id} />
    </div>
  );
}
