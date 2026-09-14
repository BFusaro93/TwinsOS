import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { computeCompanyReport } from "@/lib/company-report/compute";
import { generateCompanyReportFlags } from "@/lib/company-report/flags";
import { computeLandscaptKpiActuals } from "@/lib/kpi/landscapt-kpi-compute";
import type { CompanyReportData } from "@/types/company-report";

const log = logger.child("api/crm/company-report");

/** Metric keys read from the KPI Scorecard for the top row's progress bars. */
const TARGET_METRIC_KEYS = ["revenue_invoiced", "new_clients_ytd", "new_leads_ytd"] as const;

interface ScorecardEntryRow {
  metric_key: string;
  target_value: number | string | null;
}

/**
 * GET /api/crm/company-report
 * The Landscapt-native "Company Report" — same permission gate as the rest
 * of the Report Center. Always reflects "now": YTD from Jan 1 of the current
 * year, trailing 3 months for the monthly sections. No query params.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canView } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "view_report_center",
  });
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const now = new Date();
    const year = now.getFullYear();

    const [report, kpiActuals, targets] = await Promise.all([
      computeCompanyReport(supabase, now),
      computeLandscaptKpiActuals(supabase, year),
      loadKpiTargets(supabase, String(year)),
    ]);

    const invoicedRevenueCents = kpiActuals.values.revenue_invoiced !== null ? kpiActuals.values.revenue_invoiced * 100 : null;

    const data: CompanyReportData = {
      ...report,
      kpis: {
        invoicedRevenueYtd: {
          valueCents: invoicedRevenueCents,
          targetDollars: targets.revenue_invoiced ?? null,
        },
        arOutstandingCents: kpiActuals.values.ar_outstanding !== null ? kpiActuals.values.ar_outstanding * 100 : null,
        newClientsYtd: { value: kpiActuals.values.new_clients_ytd, target: targets.new_clients_ytd ?? null },
        newLeadsYtd: { value: kpiActuals.values.new_leads_ytd, target: targets.new_leads_ytd ?? null },
      },
    };
    data.flags = generateCompanyReportFlags(data);

    return NextResponse.json(data);
  } catch (err) {
    log.error("compute failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Failed to compute Company Report" }, { status: 500 });
  }
}

async function loadKpiTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  period: string
): Promise<Partial<Record<(typeof TARGET_METRIC_KEYS)[number], number>>> {
  const { data: scorecard } = await supabase
    .from("crm_kpi_scorecards")
    .select("id")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!scorecard) return {};

  const { data: entries } = await supabase
    .from("crm_kpi_scorecard_entries")
    .select("metric_key, target_value")
    .eq("scorecard_id", scorecard.id)
    .eq("period", period)
    .in("metric_key", TARGET_METRIC_KEYS);

  const out: Partial<Record<(typeof TARGET_METRIC_KEYS)[number], number>> = {};
  for (const row of (entries ?? []) as ScorecardEntryRow[]) {
    const v = typeof row.target_value === "string" ? parseFloat(row.target_value) : row.target_value;
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      out[row.metric_key as (typeof TARGET_METRIC_KEYS)[number]] = v;
    }
  }
  return out;
}
