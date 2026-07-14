import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getReport } from "@/lib/reports/registry";
import { runAnalysis } from "@/lib/reports/engine";

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
