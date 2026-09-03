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
    id?: string; // present when this field already exists in the DB
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

  // Fetch the current live rows for this form so we can upsert by id instead
  // of blanket delete+reinsert. crm_form_rules stores literal field UUIDs in
  // source_field_id/action_value — reissuing fresh ids on every save silently
  // orphaned every conditional rule, with no error surfaced anywhere.
  const { data: currentFieldRows } = await db
    .from("crm_form_fields")
    .select("id")
    .eq("form_id", formId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentIds = new Set<string>((currentFieldRows ?? []).map((f: any) => f.id as string));

  const incomingIds = new Set(
    fields.filter((f) => f.id && currentIds.has(f.id)).map((f) => f.id as string)
  );
  const removedIds = Array.from(currentIds).filter((fid) => !incomingIds.has(fid));

  if (removedIds.length > 0) {
    // Field genuinely removed by the user (not just resaved) — soft-delete
    // only those specific rows.
    await db
      .from("crm_form_fields")
      .update({ deleted_at: new Date().toISOString() })
      .eq("org_id", profile.org_id)
      .in("id", removedIds);

    // Clean up any conditional-logic rules that can now never fire, so the
    // Rules tab doesn't keep showing a rule pointed at a deleted field.
    await db
      .from("crm_form_rules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("form_id", formId)
      .is("deleted_at", null)
      .in("source_field_id", removedIds);
    await db
      .from("crm_form_rules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("form_id", formId)
      .is("deleted_at", null)
      .in("action", ["show_field", "hide_field"])
      .in("action_value", removedIds);
  }

  // Editing fields only ever touched crm_form_fields — the parent form's
  // updated_at (what the Forms list's "Date Modified" column reads) never
  // moved, so a field-only edit looked like it never happened.
  await db.from("crm_forms").update({ updated_at: new Date().toISOString() }).eq("id", formId);

  if (fields.length === 0) return NextResponse.json({ ok: true, fields: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultRows: any[] = new Array(fields.length).fill(null);

  // Update existing rows in place, preserving their id (and therefore any
  // crm_form_rules referencing them).
  const updateResults = await Promise.all(
    fields.map(async (f, idx) => {
      if (!f.id || !currentIds.has(f.id)) return null;
      const { data, error } = await db
        .from("crm_form_fields")
        .update({
          field_type: f.fieldType,
          label: f.label,
          placeholder: f.placeholder ?? null,
          description: f.description ?? null,
          required: f.required,
          sort_order: f.sortOrder ?? idx,
          page_number: f.pageNumber ?? 1,
          mapped_field: f.mappedField ?? null,
          options: f.options ?? null,
          config: f.config ?? {},
        })
        .eq("id", f.id)
        .eq("org_id", profile.org_id)
        .select()
        .single();
      if (error) return { idx, error };
      return { idx, data };
    })
  );
  for (const r of updateResults) {
    if (!r) continue;
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    resultRows[r.idx] = r.data;
  }

  // Insert genuinely new fields (no id, or an id we don't recognize) with a
  // fresh UUID.
  const insertIdxs: number[] = [];
  const insertRows = fields.reduce<Record<string, unknown>[]>((acc, f, idx) => {
    if (f.id && currentIds.has(f.id)) return acc;
    insertIdxs.push(idx);
    acc.push({
      form_id: formId,
      org_id: profile.org_id,
      field_type: f.fieldType,
      label: f.label,
      placeholder: f.placeholder ?? null,
      description: f.description ?? null,
      required: f.required,
      sort_order: f.sortOrder ?? idx,
      page_number: f.pageNumber ?? 1,
      mapped_field: f.mappedField ?? null,
      options: f.options ?? null,
      config: f.config ?? {},
    });
    return acc;
  }, []);

  if (insertRows.length > 0) {
    const { data: inserted, error } = await db.from("crm_form_fields").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    (inserted ?? []).forEach((row: unknown, i: number) => {
      resultRows[insertIdxs[i]] = row;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedFields = resultRows.filter(Boolean).map((f: any) => ({
    id: f.id,
    formId: f.form_id,
    fieldType: f.field_type,
    label: f.label,
    placeholder: f.placeholder,
    description: f.description ?? null,
    required: f.required,
    sortOrder: f.sort_order,
    pageNumber: f.page_number ?? 1,
    mappedField: f.mapped_field ?? null,
    options: f.options ?? null,
    config: f.config ?? {},
  }));

  return NextResponse.json({ ok: true, fields: mappedFields });
}
