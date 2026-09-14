import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  kpiScorecardConfigSchema,
  kpiScorecardInputSchema,
  type KpiScorecard,
  type KpiScorecardConfig,
} from "@/types/crm-kpi-scorecard";
import { DEFAULT_KPI_SCORECARD_CONFIG } from "@/lib/kpi/landscapt-kpi-catalog";

const log = logger.child("api/crm/kpi-scorecard");

interface ScorecardRow {
  id: string;
  name: string;
  config: unknown;
  created_at: string;
  updated_at: string;
}

const SELECT = "id, name, config, created_at, updated_at";

function mapRow(row: ScorecardRow): KpiScorecard {
  const parsed = kpiScorecardConfigSchema.safeParse(row.config);
  const config: KpiScorecardConfig = parsed.success ? parsed.data : DEFAULT_KPI_SCORECARD_CONFIG;
  return {
    id: row.id,
    name: row.name,
    config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hasPermission(supabase: SupabaseClient, key: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)("has_settings_permission", { p_key: key });
  return !!data;
}

/**
 * Resolves the caller's user + Report Center permission. Viewing the KPI
 * scorecard needs view_report_center (same as the rest of the Report Center;
 * crew logins never hold it). Changing it — layout, targets, manual actuals —
 * needs manage_report_center, the same key that gates building Custom
 * Dashboards. The tables' RLS policies enforce the same split.
 */
async function authorize(
  supabase: SupabaseClient,
  key: "view_report_center" | "manage_report_center"
): Promise<NextResponse | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(supabase, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** GET — the org's scorecard, created from the default layout on first visit.
 *  Seeding goes through the crm_kpi_scorecard_ensure() SECURITY DEFINER RPC
 *  so it happens for whoever visits first — view-only users included — while
 *  the org still comes from the session and view_report_center is enforced. */
export async function GET() {
  const supabase = await createClient();
  const denied = await authorize(supabase, "view_report_center");
  if (denied) return denied;

  // crm_kpi_scorecards is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = () => (supabase as any).from("crm_kpi_scorecards");

  const { data: existing, error } = await table()
    .select(SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.error("load scorecard failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (existing) return NextResponse.json({ scorecard: mapRow(existing as ScorecardRow) });

  // First visit for this org: seed the default layout (insert-if-missing, so a
  // concurrent first visit is harmless) and return the row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seeded, error: seedError } = await (supabase.rpc as any)("crm_kpi_scorecard_ensure", {
    p_config: DEFAULT_KPI_SCORECARD_CONFIG,
  });
  const row = Array.isArray(seeded) ? (seeded[0] as ScorecardRow | undefined) : undefined;
  if (seedError || !row) {
    log.error("seed default scorecard failed", { error: seedError?.message ?? "no row returned" });
    return NextResponse.json({ error: seedError?.message ?? "Failed to create scorecard" }, { status: 500 });
  }
  return NextResponse.json({ scorecard: mapRow(row) });
}

/** PUT — replace the scorecard layout (categories, metrics, weights). */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const denied = await authorize(supabase, "manage_report_center");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = kpiScorecardInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid scorecard" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = () => (supabase as any).from("crm_kpi_scorecards");
  const { data: existing } = await table()
    .select("id")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Scorecard not found" }, { status: 404 });
  }

  const { data, error } = await table()
    .update({
      config: parsed.data.config,
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
    })
    .eq("id", existing.id)
    .select(SELECT)
    .single();
  if (error) {
    log.error("update scorecard failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ scorecard: mapRow(data as ScorecardRow) });
}
