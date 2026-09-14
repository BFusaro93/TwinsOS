import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  loadVisitCosting,
  splitCents,
  pct,
  ratio,
  type CostedVisit,
  type ServiceTarget,
  type VisitServiceShare,
} from "@/lib/visit-costing";

const log = logger.child("reports/cogs");

// Not exported: Next.js only permits handler/config exports from route files.
const UNASSIGNED_SERVICE_ID = "unassigned";

/** Per-service rollup of completed visits in the window. Hours are MAN-hours. */
export interface COGSReportRow {
  serviceId: string;
  serviceName: string;
  /** Completed visits that include this service (a shared visit counts once per service). */
  visitCount: number;
  /** Visits whose labor was estimated rather than recorded by crew clock-out. */
  laborEstimatedVisitCount: number;
  /** Visits with NO labor rate configured (crew or org) — their labor is a placeholder $0. */
  laborMissingVisitCount: number;
  budgetedHours: number;
  actualStaffHrs: number;
  /** (actual − budgeted) ÷ budgeted × 100, one decimal. */
  hoursVariancePct: number;
  grossSalesCents: number;
  laborCostCents: number;
  materialsCostCents: number;
  directCostCents: number;
  grossProfitCents: number;
  laborPct: number;
  materialsPct: number;
  marginPct: number;
  /** Σ revenue ÷ Σ man-hours (ratio of sums, not an average of ratios). */
  avgRevPerManHrCents: number;
  targetRateCents: number;
  /** avgRevPerManHr − target; 0 when either side is missing. */
  avgOverUnderCents: number;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const QuerySchema = z.object({ from: ymd.nullable(), to: ymd.nullable() });

interface ServiceBucket {
  serviceId: string;
  serviceName: string;
  targetRateCents: number;
  visitCount: number;
  laborEstimatedVisitCount: number;
  laborMissingVisitCount: number;
  budgetedHours: number;
  actualStaffHrs: number;
  grossSalesCents: number;
  laborCostCents: number;
  materialsCostCents: number;
}

const UNASSIGNED_SHARE: VisitServiceShare[] = [
  { serviceId: UNASSIGNED_SERVICE_ID, serviceName: "Unassigned", share: 1 },
];

function bucketKey(share: VisitServiceShare): string {
  return share.serviceId ?? `name:${share.serviceName}`;
}

function getBucket(
  buckets: Map<string, ServiceBucket>,
  share: VisitServiceShare,
  services: Map<string, ServiceTarget>
): ServiceBucket {
  const key = bucketKey(share);
  const existing = buckets.get(key);
  if (existing) return existing;
  const catalog = share.serviceId ? services.get(share.serviceId) : undefined;
  const bucket: ServiceBucket = {
    serviceId: key,
    serviceName: catalog?.name ?? share.serviceName,
    targetRateCents: catalog?.targetRateCentsPerHr ?? 0,
    visitCount: 0,
    laborEstimatedVisitCount: 0,
    laborMissingVisitCount: 0,
    budgetedHours: 0,
    actualStaffHrs: 0,
    grossSalesCents: 0,
    laborCostCents: 0,
    materialsCostCents: 0,
  };
  buckets.set(key, bucket);
  return bucket;
}

/** Split one visit's $ and hours across its services by `share`, then accumulate. */
function accumulateVisit(
  visit: CostedVisit,
  buckets: Map<string, ServiceBucket>,
  services: Map<string, ServiceTarget>
): void {
  // Legacy visits with no crm_job_services rows land in "Unassigned".
  const shares = visit.services.length > 0 ? visit.services : UNASSIGNED_SHARE;
  const fractions = shares.map((s) => s.share);
  const revenue = splitCents(visit.revenueCents, fractions);
  const labor = splitCents(visit.laborCostCents, fractions);
  const materials = splitCents(visit.materialsCostCents, fractions);

  shares.forEach((share, i) => {
    const b = getBucket(buckets, share, services);
    b.visitCount += 1;
    if (visit.laborEstimated) b.laborEstimatedVisitCount += 1;
    if (visit.laborSource === "none") b.laborMissingVisitCount += 1;
    b.budgetedHours += visit.budgetedHours * share.share;
    b.actualStaffHrs += visit.manHours * share.share;
    b.grossSalesCents += revenue[i];
    b.laborCostCents += labor[i];
    b.materialsCostCents += materials[i];
  });
}

function toRow(b: ServiceBucket): COGSReportRow {
  const directCostCents = b.laborCostCents + b.materialsCostCents;
  const grossProfitCents = b.grossSalesCents - directCostCents;
  const avgRevPerManHrCents = ratio(b.grossSalesCents, b.actualStaffHrs);
  return {
    serviceId: b.serviceId,
    serviceName: b.serviceName,
    visitCount: b.visitCount,
    laborEstimatedVisitCount: b.laborEstimatedVisitCount,
    laborMissingVisitCount: b.laborMissingVisitCount,
    budgetedHours: Math.round(b.budgetedHours * 10) / 10,
    actualStaffHrs: Math.round(b.actualStaffHrs * 10) / 10,
    hoursVariancePct: pct(b.actualStaffHrs - b.budgetedHours, b.budgetedHours),
    grossSalesCents: b.grossSalesCents,
    laborCostCents: b.laborCostCents,
    materialsCostCents: b.materialsCostCents,
    directCostCents,
    grossProfitCents,
    laborPct: pct(b.laborCostCents, b.grossSalesCents),
    materialsPct: pct(b.materialsCostCents, b.grossSalesCents),
    marginPct: pct(grossProfitCents, b.grossSalesCents),
    avgRevPerManHrCents,
    targetRateCents: b.targetRateCents,
    avgOverUnderCents:
      b.targetRateCents > 0 && avgRevPerManHrCents > 0 ? avgRevPerManHrCents - b.targetRateCents : 0,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "sched_rpt_cogs",
  });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }
  const { from, to } = parsed.data;

  try {
    const { visits, services } = await loadVisitCosting(supabase, { from, to });

    const buckets = new Map<string, ServiceBucket>();
    for (const visit of visits) accumulateVisit(visit, buckets, services);

    const rows = Array.from(buckets.values())
      .map(toRow)
      .sort((a, b) => b.grossSalesCents - a.grossSalesCents);

    return NextResponse.json({ rows });
  } catch (err) {
    log.error("failed to build COGS report", { err, from, to });
    const message = err instanceof Error ? err.message : "Failed to load report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
