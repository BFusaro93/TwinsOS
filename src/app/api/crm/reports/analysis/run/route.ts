import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { analysisConfigSchema } from "@/types/crm-reports";
import { runAnalysis } from "@/lib/reports/engine";
import { getCrewRunnableScope, isCrewCaller } from "@/lib/reports/crew-dashboard-access";
import { DATASET_PERMISSION_KEYS } from "@/lib/reports/report-permissions";

/**
 * Executes an ad-hoc custom analysis (the Custom Analysis builder's
 * preview/run, and dashboard VisualSpec panels). Unlike named reports
 * (src/app/api/crm/reports/run/[reportKey]/route.ts), this runs an
 * arbitrary query against a raw dataset rather than a catalog-defined
 * report, so it's gated in two layers: a baseline check that the caller's
 * role has Report Center access at all, then a per-dataset check
 * (DATASET_PERMISSION_KEYS) for the sensitive views — payroll, invoicing,
 * payments, estimates — since base-table RLS is org-wide, not role-aware.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Crew logins have no Report Center permission; they may query only the
  // datasets used by panels of a dashboard flagged visible_to_crew (the
  // dashboard viewer adds tab date/rep filters on top of the saved panel
  // config, so matching the exact config isn't practical — the dataset is
  // the meaningful boundary). See crew-dashboard-access.ts.
  const isCrew = await isCrewCaller(supabase, user.id);
  if (!isCrew) {
    // Mirrors the client-side gate in ReportsHub.tsx/ReportCatalog.tsx, but
    // this is the actual boundary — the UI gate only hides the builder.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: canView } = await (supabase.rpc as any)("has_settings_permission", {
      p_key: "view_report_center",
    });
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = analysisConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid analysis config" },
      { status: 400 }
    );
  }

  if (isCrew) {
    const { datasets } = await getCrewRunnableScope(supabase);
    if (!datasets.has(parsed.data.dataset)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // Sensitive datasets need one of their mapped report permissions on top
    // of view_report_center (admins pass inside has_settings_permission).
    // Crew logins never hold these keys — their scope is decided above.
    const datasetKeys = DATASET_PERMISSION_KEYS[parsed.data.dataset];
    if (datasetKeys) {
      const checks = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        datasetKeys.map((key) => (supabase.rpc as any)("has_settings_permission", { p_key: key }))
      );
      if (!checks.some((r) => r.data === true)) {
        return NextResponse.json(
          { error: "You don't have permission to query this dataset" },
          { status: 403 }
        );
      }
    }
  }

  try {
    const result = await runAnalysis(
      supabase as unknown as SupabaseClient,
      parsed.data
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
