import { CustomAnalysisBuilder } from "@/components/crm/reports/report-center/CustomAnalysisBuilder";
import { AdvancedReportingGate } from "@/components/crm/reports/report-center/AdvancedReportingGate";

export default function NewAnalysisPage() {
  return (
    <AdvancedReportingGate feature="The report builder">
      <CustomAnalysisBuilder />
    </AdvancedReportingGate>
  );
}
