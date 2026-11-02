import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { buildCompletedJobInvoiceInput, createInvoiceFromJob } from "@/lib/invoices/create-from-job";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";

const log = logger.child("jobs/auto-invoice");

/**
 * The automatic draft invoice for a one-time job that was just marked
 * Completed (JobDetail.tsx). Completing a job needs no permission key, but
 * writing invoices needs acct_add_modify_invoices in the database — so, like
 * visit completion (src/lib/visits/complete-visit.ts), the invoice is built
 * and written here as the service role. The amounts come from the job's own
 * services and products in the database, never from the request, and only a
 * completed one-time job the caller can see is invoiced. Already-invoiced jobs
 * return the existing invoice (alreadyInvoiced) instead of a second one.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read under the caller's session: RLS (org + CRM access) decides whether
  // they may see — and so complete — this job.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (supabase as any)
    .from("crm_jobs")
    .select("id, org_id, job_type, status")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const j = job as { id: string; org_id: string; job_type: string; status: string };
  if (j.job_type !== "one_time" || j.status !== "completed") {
    return NextResponse.json(
      { error: "Only a completed one-time job is invoiced automatically" },
      { status: 409 }
    );
  }

  const service = createServiceClient();
  const blocked = await assertOrgWritable(service, j.org_id);
  if (blocked) return blocked;

  try {
    const today = todayInZone(await getOrgTimeZone(service, j.org_id));
    const input = await buildCompletedJobInvoiceInput(service, j.id, today);
    const { row, alreadyInvoiced } = await createInvoiceFromJob(service, user.id, input);
    return NextResponse.json({ invoiceId: (row as { id: string }).id, alreadyInvoiced });
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
    log.error("automatic invoice for completed job failed", { jobId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
