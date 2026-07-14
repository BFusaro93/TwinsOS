import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { customReportInputSchema } from "@/types/crm-reports";

interface CustomReportRow {
  id: string;
  name: string;
  description: string | null;
  config: unknown;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CustomReportRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    config: row.config,
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

  // crm_custom_reports is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_custom_reports")
    .select("id, name, description, config, created_at, updated_at")
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
      created_by: user.id,
    })
    .select("id, name, description, config, created_at, updated_at")
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
