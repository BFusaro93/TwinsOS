import { DashboardBuilder } from "@/components/crm/reports/report-center/DashboardBuilder";
import { AdvancedReportingGate } from "@/components/crm/reports/report-center/AdvancedReportingGate";

export default async function EditDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedReportingGate feature="Custom dashboards">
      <DashboardBuilder dashboardId={id} />
    </AdvancedReportingGate>
  );
}
