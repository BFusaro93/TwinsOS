import { Suspense } from "react";
import { DashboardBuilder } from "@/components/crm/reports/report-center/DashboardBuilder";
import { AdvancedReportingGate } from "@/components/crm/reports/report-center/AdvancedReportingGate";

export default function NewDashboardPage() {
  return (
    <AdvancedReportingGate feature="Custom dashboards">
      <Suspense fallback={null}>
        <DashboardBuilder />
      </Suspense>
    </AdvancedReportingGate>
  );
}
