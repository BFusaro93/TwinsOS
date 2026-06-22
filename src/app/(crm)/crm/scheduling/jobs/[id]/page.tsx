import { JobDetail } from "@/components/crm/jobs/JobDetail";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetail jobId={id} />;
}
