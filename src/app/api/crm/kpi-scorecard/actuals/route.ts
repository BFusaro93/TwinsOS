import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { computeLandscaptKpiActuals } from "@/lib/kpi/landscapt-kpi-compute";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import {
  ESTIMATE_DATASET_KEYS,
  PAYMENT_DATASET_KEYS,
  TIMESHEET_DATASET_KEYS,
} from "@/lib/reports/report-permissions";

const log = logger.child("api/crm/kpi-scorecard/actuals");

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

/**
 * GET /api/crm/kpi-scorecard/actuals?year=2026
 * Live values for every auto metric in the Landscapt KPI catalog, computed
 * from the caller's org data (RLS-scoped). Nothing is stored — the card
 * recomputes on each load, so it never goes stale.
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    year: url.searchParams.get("year") ?? new Date().getFullYear(),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    // Mirror analysis/run's DATASET_PERMISSION_KEYS: money, estimate pricing
    // and payroll areas are computed only for roles holding the matching keys
    // (admins pass inside has_settings_permission). Other areas stay open
    // behind view_report_center, as before.
    const [money, estimates, payroll] = await Promise.all([
      hasAnySettingsPermission(supabase, PAYMENT_DATASET_KEYS),
      hasAnySettingsPermission(supabase, ESTIMATE_DATASET_KEYS),
      hasAnySettingsPermission(supabase, TIMESHEET_DATASET_KEYS),
    ]);
    const allowedAreas = new Set(["clients", "visits", "tickets", "damage_cases", "injury_cases"]);
    if (money) ["invoices", "payments", "contracts"].forEach((a) => allowedAreas.add(a));
    if (estimates) ["jobs", "estimates"].forEach((a) => allowedAreas.add(a));
    if (payroll) ["timesheets", "employees"].forEach((a) => allowedAreas.add(a));

    const result = await computeLandscaptKpiActuals(supabase, parsed.data.year, undefined, allowedAreas);
    return NextResponse.json(result);
  } catch (err) {
    log.error("compute failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Failed to compute KPI actuals" }, { status: 500 });
  }
}
