import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface COGSReportRow {
  serviceId: string;
  serviceName: string;
  visitCount: number;
  budgetedHours: number;
  actualStaffHrs: number;
  hoursVariancePct: number;
  grossSalesCents: number;
  laborCostCents: number;
  materialsCostCents: number;
  directCostCents: number;
  grossProfitCents: number;
  laborPct: number;
  materialsPct: number;
  marginPct: number;
  avgRevPerManHrCents: number;
  targetRateCents: number;
  avgOverUnderCents: number;
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

  // Aggregated per completed VISIT, not per job: a recurring job is one
  // crm_jobs row with many crm_job_visits accumulating over its life, and
  // crm_jobs.actual_hours / actual_labor_cost_cents are lifetime rollups
  // across every visit the job has ever had (see
  // 20260726000000_crm_jobs_actual_hours_rollup.sql) — not scoped to any
  // date range, so they can't drive a dated report. crm_jobs also has no
  // service_id or estimate_id — services live on the separate
  // crm_job_services table (many per job).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vq = (supabase as any)
    .from("crm_job_visits")
    .select(`
      id,
      job_id,
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
    .select("id, man_count, rate_cents, budgeted_hours")
    .in("id", safeJobIds)
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobMap = new Map<string, any>((jobs ?? []).map((j: any) => [j.id, j]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobServices } = await (supabase as any)
    .from("crm_job_services")
    .select("id, job_id, service_id, service_name, sort_order, crm_services:service_id ( name, target_rate_cents_per_hr )")
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

  // Aggregate by service
  interface ServiceBucket {
    serviceId: string;
    serviceName: string;
    targetRateCents: number;
    visitCount: number;
    budgetedHours: number;
    actualStaffHrs: number;
    grossSalesCents: number;
    laborCostCents: number;
    materialsCostCents: number;
    revPerManHrSamples: number[];
  }

  const byService = new Map<string, ServiceBucket>();

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
    if (!jobService) continue; // can't attribute this visit to a single service

    const svcId: string = jobService.service_id;
    const svcName: string = jobService.crm_services?.name ?? jobService.service_name ?? "Unknown";
    const targetRate: number = jobService.crm_services?.target_rate_cents_per_hr ?? 0;

    if (!byService.has(svcId)) {
      byService.set(svcId, {
        serviceId: svcId,
        serviceName: svcName,
        targetRateCents: targetRate,
        visitCount: 0,
        budgetedHours: 0,
        actualStaffHrs: 0,
        grossSalesCents: 0,
        laborCostCents: 0,
        materialsCostCents: 0,
        revPerManHrSamples: [],
      });
    }

    const bucket = byService.get(svcId)!;
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
    const revenueCents = Math.round(rateCents * qty);
    const revPerManHr = actualStaffHrs > 0 ? Math.round(revenueCents / actualStaffHrs) : 0;

    bucket.visitCount++;
    bucket.budgetedHours += Number(v.budgeted_hours ?? job.budgeted_hours ?? 0);
    bucket.actualStaffHrs += actualStaffHrs;
    bucket.grossSalesCents += revenueCents;
    bucket.laborCostCents += Number(v.actual_labor_cost_cents ?? 0);
    bucket.materialsCostCents += materialsByVisit.get(v.id) ?? 0;
    if (revPerManHr > 0) bucket.revPerManHrSamples.push(revPerManHr);
  }

  const rows: COGSReportRow[] = Array.from(byService.values()).map((b) => {
    const directCostCents = b.laborCostCents + b.materialsCostCents;
    const grossProfitCents = b.grossSalesCents - directCostCents;
    const marginPct = b.grossSalesCents > 0
      ? Math.round((grossProfitCents / b.grossSalesCents) * 1000) / 10
      : 0;
    const laborPct = b.grossSalesCents > 0
      ? Math.round((b.laborCostCents / b.grossSalesCents) * 1000) / 10
      : 0;
    const materialsPct = b.grossSalesCents > 0
      ? Math.round((b.materialsCostCents / b.grossSalesCents) * 1000) / 10
      : 0;
    const avgRevPerManHr = b.revPerManHrSamples.length > 0
      ? Math.round(b.revPerManHrSamples.reduce((s, v) => s + v, 0) / b.revPerManHrSamples.length)
      : 0;
    const hoursVariancePct = b.budgetedHours > 0
      ? Math.round(((b.actualStaffHrs - b.budgetedHours) / b.budgetedHours) * 1000) / 10
      : 0;

    return {
      serviceId: b.serviceId,
      serviceName: b.serviceName,
      visitCount: b.visitCount,
      budgetedHours: Math.round(b.budgetedHours * 10) / 10,
      actualStaffHrs: Math.round(b.actualStaffHrs * 10) / 10,
      hoursVariancePct,
      grossSalesCents: b.grossSalesCents,
      laborCostCents: b.laborCostCents,
      materialsCostCents: b.materialsCostCents,
      directCostCents,
      grossProfitCents,
      laborPct,
      materialsPct,
      marginPct,
      avgRevPerManHrCents: avgRevPerManHr,
      targetRateCents: b.targetRateCents,
      avgOverUnderCents: avgRevPerManHr - b.targetRateCents,
    };
  }).sort((a, b) => b.grossSalesCents - a.grossSalesCents);

  return NextResponse.json({ rows });
}
