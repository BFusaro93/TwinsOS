import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface JobCostingReportRow {
  jobId: string;
  jobTitle: string;
  clientName: string;
  serviceName: string;
  completedAt: string;
  menCount: number;
  budgetedHours: number;
  actualHours: number;
  actualStaffHrs: number;
  hoursVariance: number;
  budgetedRateCents: number;
  revPerManHrCents: number;
  targetRateCents: number;
  overUnderCents: number;
  actualLaborCostCents: number;
  estimatedRevenueCents: number;
  actualMaterialCostCents: number;
  grossProfitCents: number;
  marginPct: number;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const serviceId = searchParams.get("service_id");

  // completed_at + status='completed' lives on crm_job_visits, not crm_jobs —
  // filter visits first, then look up the jobs those visits belong to (see
  // visitMap dedupe below). clocked_out_at only reflects the crew time-clock
  // flow and stays null for visits completed via the dispatch board, so it
  // undercounts completed jobs — use the visit's own completion signal instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let visitQ = (supabase as any)
    .from("crm_job_visits")
    .select("job_id, men_count, rate_cents, completed_at")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .is("deleted_at", null)
    .order("completed_at", { ascending: false });

  if (from) visitQ = visitQ.gte("completed_at", from);
  // completed_at is a timestamptz — a bare date string casts to midnight
  // UTC, which in any US timezone excludes almost the entire `to` day.
  if (to) visitQ = visitQ.lte("completed_at", `${to} 23:59:59.999`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits, error: visitsError } = await (visitQ as any);
  if (visitsError) return NextResponse.json({ error: visitsError.message }, { status: 500 });

  // Build a map: jobId → most recent visit within range
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visitMap = new Map<string, { men_count: number; rate_cents: number; completed_at: string }>();
  for (const v of (visits ?? [])) {
    if (!visitMap.has(v.job_id)) visitMap.set(v.job_id, v);
  }

  const jobIds: string[] = [...visitMap.keys()];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("crm_jobs")
    .select(`
      id,
      title,
      actual_hours,
      actual_labor_cost_cents,
      actual_material_cost_cents,
      service_id,
      clients:client_id ( display_name ),
      crm_services:service_id ( name, target_rate_cents_per_hr ),
      estimates:estimate_id ( total_cents, total_budgeted_hours )
    `)
    .is("deleted_at", null)
    .in("id", jobIds.length > 0 ? jobIds : ["00000000-0000-0000-0000-000000000000"]);

  if (serviceId) q = q.eq("service_id", serviceId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error } = await (q as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: JobCostingReportRow[] = (jobs ?? []).map((job: any): JobCostingReportRow => {
    const visit = visitMap.get(job.id);
    // crm_jobs.actual_hours is already man-hours — crm_recompute_job_actual_hours
    // sums each visit's (duration × its own men_count), so multiplying by this
    // job's most-recent-visit men_count again here double-counted crew size,
    // halving revPerManHr and doubling the reported hours variance for any
    // job with more than one crew member.
    const actualHours = Number(job.actual_hours ?? 0);
    const menCount = Number(visit?.men_count ?? 1);
    const actualStaffHrs = actualHours;
    const rateCents: number = visit?.rate_cents ?? 0;
    const revPerManHrCents = actualStaffHrs > 0 ? Math.round(rateCents / actualStaffHrs) : 0;
    const targetRateCents: number = job.crm_services?.target_rate_cents_per_hr ?? 0;
    const overUnderCents = revPerManHrCents - targetRateCents;
    const estimatedRevenueCents: number = job.estimates?.total_cents ?? 0;
    const budgetedHours = Number(job.estimates?.total_budgeted_hours ?? 0);
    const actualLaborCostCents: number = job.actual_labor_cost_cents ?? 0;
    const actualMaterialCostCents: number = job.actual_material_cost_cents ?? 0;
    const grossProfitCents = estimatedRevenueCents - actualLaborCostCents - actualMaterialCostCents;
    const marginPct = estimatedRevenueCents > 0
      ? Math.round((grossProfitCents / estimatedRevenueCents) * 1000) / 10
      : 0;

    return {
      jobId: job.id,
      jobTitle: job.title ?? "Untitled",
      clientName: job.clients?.display_name ?? "—",
      serviceName: job.crm_services?.name ?? "—",
      completedAt: visit?.completed_at ?? "",
      menCount,
      budgetedHours,
      actualHours,
      actualStaffHrs,
      hoursVariance: actualStaffHrs - budgetedHours,
      budgetedRateCents: estimatedRevenueCents > 0 && budgetedHours > 0
        ? Math.round(estimatedRevenueCents / budgetedHours)
        : 0,
      revPerManHrCents,
      targetRateCents,
      overUnderCents,
      actualLaborCostCents,
      estimatedRevenueCents,
      actualMaterialCostCents,
      grossProfitCents,
      marginPct,
    };
  });

  return NextResponse.json({ rows });
}
