import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { customReportInputSchema } from "@/types/crm-reports";

interface CustomReportRow {
  id: string;
  name: string;
  description: string | null;
  config: unknown;
  visual_type: string | null;
  label_column: string | null;
  value_columns: string[] | null;
  kpi_column: string | null;
  format_rules: unknown;
  color_spectrum_columns: string[] | null;
  header_visual: unknown;
  header_visual_title: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CustomReportRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    config: row.config,
    visualType: row.visual_type ?? "table",
    labelColumn: row.label_column,
    valueColumns: row.value_columns ?? [],
    kpiColumn: row.kpi_column,
    formatRules: row.format_rules ?? [],
    colorSpectrumColumns: row.color_spectrum_columns ?? [],
    headerVisual: row.header_visual ?? null,
    headerVisualTitle: row.header_visual_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mirrors the client-side gate in ReportsHub.tsx, but this is the actual
  // boundary — the UI gate only hides the My Reports list. Saved analysis
  // configs reveal which datasets/columns the org reports on, so they're
  // Report Center content like dashboards are.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canView } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "view_report_center",
  });
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // crm_custom_reports is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_custom_reports")
    .select("id, name, description, config, visual_type, label_column, value_columns, kpi_column, format_rules, color_spectrum_columns, header_visual, header_visual_title, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    reports: ((data ?? []) as CustomReportRow[]).map(mapRow),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = customReportInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid report" },
      { status: 400 }
    );
  }

  // crm_custom_reports is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_custom_reports")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: parsed.data.config,
      visual_type: parsed.data.visualType ?? "table",
      label_column: parsed.data.labelColumn ?? null,
      value_columns: parsed.data.valueColumns ?? [],
      kpi_column: parsed.data.kpiColumn ?? null,
      format_rules: parsed.data.formatRules ?? [],
      color_spectrum_columns: parsed.data.colorSpectrumColumns ?? [],
      header_visual: parsed.data.headerVisual ?? null,
      header_visual_title: parsed.data.headerVisualTitle ?? null,
      created_by: user.id,
    })
    .select("id, name, description, config, visual_type, label_column, value_columns, kpi_column, format_rules, color_spectrum_columns, header_visual, header_visual_title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 }
    );
  }
  return NextResponse.json(
    { report: mapRow(data as CustomReportRow) },
    { status: 201 }
  );
}
