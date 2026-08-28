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
    headerVisual: row.header_visual ?? null,
    headerVisualTitle: row.header_visual_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAuthed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthed();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // crm_custom_reports is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_custom_reports")
    .select("id, name, description, config, visual_type, label_column, value_columns, kpi_column, format_rules, header_visual, header_visual_title, created_at, updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ report: mapRow(data as CustomReportRow) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthed();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = customReportInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid report" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.config !== undefined) patch.config = parsed.data.config;
  if (parsed.data.visualType !== undefined) patch.visual_type = parsed.data.visualType;
  if (parsed.data.labelColumn !== undefined) patch.label_column = parsed.data.labelColumn;
  if (parsed.data.valueColumns !== undefined) patch.value_columns = parsed.data.valueColumns;
  if (parsed.data.kpiColumn !== undefined) patch.kpi_column = parsed.data.kpiColumn;
  if (parsed.data.formatRules !== undefined) patch.format_rules = parsed.data.formatRules;
  if (parsed.data.headerVisual !== undefined) patch.header_visual = parsed.data.headerVisual;
  if (parsed.data.headerVisualTitle !== undefined) patch.header_visual_title = parsed.data.headerVisualTitle;

  // crm_custom_reports is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_custom_reports")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, description, config, visual_type, label_column, value_columns, kpi_column, format_rules, header_visual, header_visual_title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Not found" },
      { status: error ? 500 : 404 }
    );
  }
  return NextResponse.json({ report: mapRow(data as CustomReportRow) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthed();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Soft delete, per project convention
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("crm_custom_reports")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
