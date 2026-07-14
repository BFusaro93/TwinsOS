import { CustomAnalysisBuilder } from "@/components/crm/reports/report-center/CustomAnalysisBuilder";

export default async function EditAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomAnalysisBuilder reportId={id} />;
}
