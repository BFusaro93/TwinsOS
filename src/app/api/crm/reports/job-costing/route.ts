import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface JobCostingReportRow {
  visitId: string;
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

  // Reported per completed VISIT, not per job: a recurring job is one
  // crm_jobs row with many crm_job_visits accumulating over its life, and
  // crm_jobs.actual_hours / actual_labor_cost_cents are lifetime rollups
  // across every visit the job has ever had (see
  // 20260726000000_crm_jobs_actual_hours_rollup.sql) — not scoped to any
  // date range, so they can't drive a dated report.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vq = (supabase as any)
    .from("crm_job_visits")
    .select(`
      id,
      job_id,
      client_id,
      job_service_id,
      clocked_in_at,
      clocked_out_at,
      actual_hours,
      men_count,
      rate_cents,
      qty,
      budgeted_hours,
      actual_labor_cost_cents
    `)
    .is("deleted_at", null)
    .not("clocked_out_at", "is", null);

  if (from) vq = vq.gte("clocked_out_at", from);
  if (to) vq = vq.lte("clocked_out_at", to);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits, error } = await (vq as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobIds = Array.from(new Set((visits ?? []).map((v: { job_id: string }) => v.job_id)));
  const safeJobIds = jobIds.length > 0 ? jobIds : ["00000000-0000-0000-0000-000000000000"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs } = await (supabase as any)
    .from("crm_jobs")
    .select("id, job_number, client_id, man_count, rate_cents, budgeted_hours, actual_material_cost_cents")
    .in("id", safeJobIds)
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobMap = new Map<string, any>((jobs ?? []).map((j: any) => [j.id, j]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobServices } = await (supabase as any)
    .from("crm_job_services")
    .select("id, job_id, service_id, service_name, sort_order, crm_services:service_id ( target_rate_cents_per_hr )")
    .in("job_id", safeJobIds)
    .order("sort_order", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobServiceById = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobServicesByJob = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const js of (jobServices ?? []) as any[]) {
    jobServiceById.set(js.id, js);
    const list = jobServicesByJob.get(js.job_id) ?? [];
    list.push(js);
    jobServicesByJob.set(js.job_id, list);
  }

  const clientIds = Array.from(new Set([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(visits ?? []).map((v: any) => v.client_id).filter(Boolean),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(jobs ?? []).map((j: any) => j.client_id).filter(Boolean),
  ]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clients } = await (supabase as any)
    .from("clients")
    .select("id, display_name")
    .in("id", clientIds.length > 0 ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientMap = new Map<string, string>((clients ?? []).map((c: any) => [c.id, c.display_name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visitIds = (visits ?? []).map((v: any) => v.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: materials } = await (supabase as any)
    .from("crm_job_materials")
    .select("visit_id, total_cost_cents")
    .in("visit_id", visitIds.length > 0 ? visitIds : ["00000000-0000-0000-0000-000000000000"])
    .is("deleted_at", null);

  const materialsByVisit = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (materials ?? []) as any[]) {
    if (!m.visit_id) continue;
    materialsByVisit.set(m.visit_id, (materialsByVisit.get(m.visit_id) ?? 0) + Number(m.total_cost_cents ?? 0));
  }

  const rows: JobCostingReportRow[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of (visits ?? []) as any[]) {
    const job = jobMap.get(v.job_id);
    if (!job) continue;

    const jobServicesForJob = jobServicesByJob.get(v.job_id) ?? [];
    // A visit tied to a specific crm_job_services row (job_service_id) uses
    // that service; otherwise fall back to the job's only service if it has
    // exactly one — a job with several services can't be attributed to one.
    let jobService = v.job_service_id ? jobServiceById.get(v.job_service_id) : undefined;
    if (!jobService && jobServicesForJob.length === 1) jobService = jobServicesForJob[0];

    if (serviceId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matches = jobService
        ? jobService.service_id === serviceId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : jobServicesForJob.some((js: any) => js.service_id === serviceId);
      if (!matches) continue;
    }

    const actualHours = Number(
      v.actual_hours ??
      (v.clocked_in_at && v.clocked_out_at
        ? (new Date(v.clocked_out_at).getTime() - new Date(v.clocked_in_at).getTime()) / 3_600_000
        : 0)
    );
    const menCount = Number(v.men_count ?? job.man_count ?? 1);
    const actualStaffHrs = actualHours * menCount;
    const rateCents: number = v.rate_cents ?? job.rate_cents ?? 0;
    const qty = Number(v.qty) > 0 ? Number(v.qty) : 1;
    const estimatedRevenueCents = Math.round(rateCents * qty);
    const revPerManHrCents = actualStaffHrs > 0 ? Math.round(estimatedRevenueCents / actualStaffHrs) : 0;
    const targetRateCents: number = jobService?.crm_services?.target_rate_cents_per_hr ?? 0;
    const overUnderCents = revPerManHrCents - targetRateCents;
    const budgetedHours = Number(v.budgeted_hours ?? job.budgeted_hours ?? 0);
    const actualLaborCostCents = Number(v.actual_labor_cost_cents ?? 0);
    const actualMaterialCostCents = materialsByVisit.get(v.id) ?? 0;
    const grossProfitCents = estimatedRevenueCents - actualLaborCostCents - actualMaterialCostCents;
    const marginPct = estimatedRevenueCents > 0
      ? Math.round((grossProfitCents / estimatedRevenueCents) * 1000) / 10
      : 0;
    const serviceName = jobService?.service_name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?? (jobServicesForJob.map((js: any) => js.service_name).join(", ") || "—");

    rows.push({
      visitId: v.id,
      jobId: job.id,
      jobTitle: `Job #${job.job_number}`,
      clientName: clientMap.get(v.client_id ?? job.client_id) ?? "—",
      serviceName,
      completedAt: v.clocked_out_at ?? "",
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
    });
  }

  return NextResponse.json({ rows });
}
