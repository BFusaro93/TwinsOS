import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { analysisConfigSchema } from "@/types/crm-reports";
import { runAnalysis } from "@/lib/reports/engine";
import { getCrewRunnableScope, isCrewCaller } from "@/lib/reports/crew-dashboard-access";

/**
 * Executes an ad-hoc custom analysis (the Custom Analysis builder's
 * preview/run, and dashboard VisualSpec panels). Unlike named reports
 * (src/app/api/crm/reports/run/[reportKey]/route.ts), this runs an
 * arbitrary query against a raw dataset rather than a catalog-defined
 * report, so there's no per-dataset permission mapping to check — only a
 * baseline gate that the caller's role has Report Center access at all.
 * This does not (yet) stop someone with baseline access from querying a
 * dataset that underlies a report they're specifically denied — that would
 * need a dataset-to-permission-key mapping, a larger follow-up.
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
