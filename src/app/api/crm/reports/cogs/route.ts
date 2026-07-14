import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface COGSReportRow {
  serviceId: string;
  serviceName: string;
  jobCount: number;
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

  // Fetch completed jobs with service, estimate, and visit data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("crm_jobs")
    .select(`
      id,
      actual_hours,
      actual_labor_cost_cents,
      actual_material_cost_cents,
      service_id,
      crm_services:service_id ( id, name, target_rate_cents_per_hr ),
      estimates:estimate_id ( total_cents, total_budgeted_hours )
    `)
    .is("deleted_at", null)
    .not("service_id", "is", null);

  if (from) q = q.gte("updated_at", from);
  if (to) q = q.lte("updated_at", to);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error } = await (q as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobIds: string[] = (jobs ?? []).map((j: { id: string }) => j.id);

  // Fetch most recent completed visit per job for men_count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, men_count, rate_cents, clocked_out_at")
    .in("job_id", jobIds.length > 0 ? jobIds : ["00000000-0000-0000-0000-000000000000"])
    .not("clocked_out_at", "is", null)
    .order("clocked_out_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visitMap = new Map<string, { men_count: number; rate_cents: number }>();
  for (const v of (visits ?? [])) {
    if (!visitMap.has(v.job_id)) visitMap.set(v.job_id, v);
  }

  // Aggregate by service
  interface ServiceBucket {
    serviceId: string;
    serviceName: string;
    targetRateCents: number;
    jobCount: number;
    budgetedHours: number;
    actualStaffHrs: number;
    grossSalesCents: number;
    laborCostCents: number;
    materialsCostCents: number;
    revPerManHrSamples: number[];
  }

  const byService = new Map<string, ServiceBucket>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const job of (jobs ?? []) as any[]) {
    const svcId: string = job.service_id;
    const svcName: string = job.crm_services?.name ?? "Unknown";
    const targetRate: number = job.crm_services?.target_rate_cents_per_hr ?? 0;

    if (!byService.has(svcId)) {
      byService.set(svcId, {
        serviceId: svcId,
        serviceName: svcName,
        targetRateCents: targetRate,
        jobCount: 0,
        budgetedHours: 0,
        actualStaffHrs: 0,
        grossSalesCents: 0,
        laborCostCents: 0,
        materialsCostCents: 0,
        revPerManHrSamples: [],
      });
    }

    const bucket = byService.get(svcId)!;
    const visit = visitMap.get(job.id);
    const actualHours = Number(job.actual_hours ?? 0);
    const menCount = Number(visit?.men_count ?? 1);
    const actualStaffHrs = actualHours * menCount;
    const rateCents: number = visit?.rate_cents ?? 0;
    const revPerManHr = actualStaffHrs > 0 ? Math.round(rateCents / actualStaffHrs) : 0;

    bucket.jobCount++;
    bucket.budgetedHours += Number(job.estimates?.total_budgeted_hours ?? 0);
    bucket.actualStaffHrs += actualStaffHrs;
    bucket.grossSalesCents += Number(job.estimates?.total_cents ?? 0);
    bucket.laborCostCents += Number(job.actual_labor_cost_cents ?? 0);
    bucket.materialsCostCents += Number(job.actual_material_cost_cents ?? 0);
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
      jobCount: b.jobCount,
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
