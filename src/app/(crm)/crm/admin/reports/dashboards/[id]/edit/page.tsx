import { DashboardBuilder } from "@/components/crm/reports/report-center/DashboardBuilder";

export default async function EditDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DashboardBuilder dashboardId={id} />;
}
