import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getReport } from "@/lib/reports/registry";
import { runAnalysis } from "@/lib/reports/engine";
import { REPORT_PERMISSION_KEYS } from "@/lib/reports/report-permissions";
import { getCrewRunnableScope, isCrewCaller } from "@/lib/reports/crew-dashboard-access";

/**
 * Executes a pre-built Report Center report by key. Filter values arrive as
 * query params (from/to for date ranges, plus report-specific keys).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportKey: string }> }
) {
  const { reportKey } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const def = getReport(reportKey);
  if (!def) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  // Reports can expose sensitive data (balances, payroll, invoicing) —
  // mirrors the client-side gate in ReportCatalog.tsx, but this is the
  // actual boundary since the catalog only hides the link. A report with
  // no entry here has no catalog-defined permission and is left ungated.
  //
  // Crew logins never hold any of these keys; they may run a report only when
  // it's embedded in a dashboard an admin flagged visible_to_crew — see
  // crew-dashboard-access.ts.
  const permissionKeys = REPORT_PERMISSION_KEYS[reportKey];
  if (await isCrewCaller(supabase, user.id)) {
    const { reportKeys } = await getCrewRunnableScope(supabase);
    if (!reportKeys.has(reportKey)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (permissionKeys) {
    const checks = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      permissionKeys.map((key) => (supabase.rpc as any)("has_settings_permission", { p_key: key }))
    );
    if (!checks.some((r) => r.data === true)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (def.href) {
    return NextResponse.json(
      { error: "This report lives on its own page", href: def.href },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const reportParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    reportParams[key] = value;
  });

  try {
    if (def.run) {
      const result = await def.run({
        supabase: supabase as unknown as SupabaseClient,
        params: reportParams,
      });
      return NextResponse.json({ ...result, notes: result.notes ?? def.notes });
    }
    if (def.analysis) {
      const config = def.analysis(reportParams);
      const result = await runAnalysis(
        supabase as unknown as SupabaseClient,
        config
      );
      return NextResponse.json({ ...result, notes: def.notes });
    }
    return NextResponse.json(
      { error: "Report has no handler" },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
