import { ReportViewer } from "@/components/crm/reports/report-center/ReportViewer";

export default async function ReportViewerPage({
  params,
}: {
  params: Promise<{ reportKey: string }>;
}) {
  const { reportKey } = await params;
  return <ReportViewer reportKey={reportKey} />;
}
