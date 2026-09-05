import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { computeLandscaptKpiActuals } from "@/lib/kpi/landscapt-kpi-compute";

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
    const result = await computeLandscaptKpiActuals(supabase, parsed.data.year);
    return NextResponse.json(result);
  } catch (err) {
    log.error("compute failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Failed to compute KPI actuals" }, { status: 500 });
  }
}
