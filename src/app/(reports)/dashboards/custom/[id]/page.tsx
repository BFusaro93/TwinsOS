import { ModuleAccessGuard } from "@/components/shared/ModuleAccessGuard";
import { DashboardViewer } from "@/components/crm/reports/report-center/DashboardViewer";

export default async function CustomDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ModuleAccessGuard module="landscapt">
      <DashboardViewer dashboardId={id} />
    </ModuleAccessGuard>
  );
}
