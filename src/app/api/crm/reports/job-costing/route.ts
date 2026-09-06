import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  loadVisitCosting,
  weightedTargetRate,
  pct,
  ratio,
  type CostedVisit,
  type ServiceTarget,
} from "@/lib/visit-costing";

const log = logger.child("reports/job-costing");

/** One row per completed visit in the window. All hours are MAN-hours. */
export interface JobCostingReportRow {
  visitId: string;
  jobId: string | null;
  clientName: string;
  serviceNames: string;
  crewName: string | null;
  completedAt: string;
  menCount: number;
  budgetedHours: number;
  actualManHours: number;
  /** actual − budgeted; positive means over budget. */
  hoursVariance: number;
  /** revenue ÷ budgeted man-hours. */
  budgetedRateCents: number;
  /** revenue ÷ actual man-hours. */
  revPerManHrCents: number;
  /** Man-hour-weighted crm_services.target_rate_cents_per_hr; 0 if none. */
  targetRateCents: number;
  /** revPerManHr − target. */
  overUnderCents: number;
  laborCostCents: number;
  /** Labor was estimated (man-hours × crew burden) — no crew clock-out. */
  laborEstimated: boolean;
  revenueCents: number;
  materialsCostCents: number;
  grossProfitCents: number;
  /** 0–100, one decimal. */
  marginPct: number;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const QuerySchema = z.object({
  from: ymd.nullable(),
  to: ymd.nullable(),
  service_id: z.string().uuid().nullable(),
});

function toRow(visit: CostedVisit, services: Map<string, ServiceTarget>): JobCostingReportRow {
  const revPerManHrCents = ratio(visit.revenueCents, visit.manHours);
  const targetRateCents = weightedTargetRate(visit.services, services);
  const grossProfitCents = visit.revenueCents - visit.laborCostCents - visit.materialsCostCents;
  return {
    visitId: visit.visitId,
    jobId: visit.jobId,
    clientName: visit.clientName,
    serviceNames: visit.serviceNames,
    crewName: visit.crewName,
    completedAt: visit.completedAt,
    menCount: visit.menCount,
    budgetedHours: visit.budgetedHours,
    actualManHours: visit.manHours,
    hoursVariance: Math.round((visit.manHours - visit.budgetedHours) * 100) / 100,
    budgetedRateCents: ratio(visit.revenueCents, visit.budgetedHours),
    revPerManHrCents,
    targetRateCents,
    overUnderCents: targetRateCents > 0 && revPerManHrCents > 0 ? revPerManHrCents - targetRateCents : 0,
    laborCostCents: visit.laborCostCents,
    laborEstimated: visit.laborEstimated,
    revenueCents: visit.revenueCents,
    materialsCostCents: visit.materialsCostCents,
    grossProfitCents,
    marginPct: pct(grossProfitCents, visit.revenueCents),
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "sched_rpt_job_costing",
  });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    service_id: searchParams.get("service_id"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }
  const { from, to, service_id: serviceId } = parsed.data;

  try {
    const { visits, services } = await loadVisitCosting(supabase, { from, to });

    // The service filter selects whole visits that include the service; the
    // row still shows the full visit's numbers (this is a per-visit report).
    const selected = serviceId
      ? visits.filter((v) => v.services.some((s) => s.serviceId === serviceId))
      : visits;

    const rows = selected
      .map((v) => toRow(v, services))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

    return NextResponse.json({ rows });
  } catch (err) {
    log.error("failed to build job costing report", { err, from, to, serviceId });
    const message = err instanceof Error ? err.message : "Failed to load report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
