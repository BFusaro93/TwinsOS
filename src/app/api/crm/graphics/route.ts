import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { savedGraphicInputSchema } from "@/types/crm-reports";

interface SavedGraphicRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  visual: unknown;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SavedGraphicRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    visual: row.visual,
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

  // Saved graphics are Report Center content (the Graphics Library lives
  // behind the same UI gate as dashboards) — enforce it here as well.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canView } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "view_report_center",
  });
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // crm_saved_graphics is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_saved_graphics")
    .select("id, name, description, category, visual, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    graphics: ((data ?? []) as SavedGraphicRow[]).map(mapRow),
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

  const parsed = savedGraphicInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid graphic" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_saved_graphics")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      visual: parsed.data.visual,
      created_by: user.id,
    })
    .select("id, name, description, category, visual, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 }
    );
  }
  return NextResponse.json(
    { graphic: mapRow(data as SavedGraphicRow) },
    { status: 201 }
  );
}
