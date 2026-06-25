import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PUT /api/crm/forms/[id]/fields — replace all fields for a form
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: formId } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const { data: form } = await db
    .from("crm_forms")
    .select("id")
    .eq("id", formId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const body = await req.json();
  const fields: Array<{
    fieldType: string;
    label: string;
    placeholder?: string | null;
    description?: string | null;
    required: boolean;
    sortOrder: number;
    pageNumber?: number;
    mappedField?: string | null;
    options?: string[] | null;
    config?: Record<string, unknown>;
  }> = body.fields ?? [];

  // Soft-delete all existing fields, then insert fresh
  await db
    .from("crm_form_fields")
    .update({ deleted_at: new Date().toISOString() })
    .eq("form_id", formId)
    .eq("org_id", profile.org_id);

  if (fields.length > 0) {
    const rows = fields.map((f, i) => ({
      form_id: formId,
      org_id: profile.org_id,
      field_type: f.fieldType,
      label: f.label,
      placeholder: f.placeholder ?? null,
      description: f.description ?? null,
      required: f.required,
      sort_order: f.sortOrder ?? i,
      page_number: f.pageNumber ?? 1,
      mapped_field: f.mappedField ?? null,
      options: f.options ?? null,
      config: f.config ?? {},
    }));

    const { error } = await db.from("crm_form_fields").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
