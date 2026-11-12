import { CustomAnalysisBuilder } from "@/components/crm/reports/report-center/CustomAnalysisBuilder";
import { AdvancedReportingGate } from "@/components/crm/reports/report-center/AdvancedReportingGate";

export default async function EditAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedReportingGate feature="The report builder">
      <CustomAnalysisBuilder reportId={id} />
    </AdvancedReportingGate>
  );
}
