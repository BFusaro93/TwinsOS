import { DashboardViewer } from "@/components/crm/reports/report-center/DashboardViewer";

export default async function DashboardViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DashboardViewer dashboardId={id} />;
}
