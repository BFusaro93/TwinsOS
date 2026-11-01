import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rejectWithoutFormsPermission } from "@/lib/auth/forms-permission";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { logger } from "@/lib/logger";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// POST /api/crm/forms/[id]/copy — duplicates a form (settings, fields, rules)
// as "<name> (Copy)", UNPUBLISHED, with a fresh slug. Rules that reference
// field ids (source_field_id, and action_value for show_field/hide_field) are
// remapped to the copied fields. Responses are never copied. org_id comes from
// the session only.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });
  {
    const denied = await rejectWithoutFormsPermission(supabase, "edit");
    if (denied) return denied;
  }
  const orgId: string = profile.org_id;

  const { data: source } = await db
    .from("crm_forms")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const [{ data: sourceFields, error: fieldsError }, { data: sourceRules, error: rulesError }] = await Promise.all([
    db.from("crm_form_fields").select("*").eq("form_id", id).eq("org_id", orgId).is("deleted_at", null).order("sort_order", { ascending: true }),
    db.from("crm_form_rules").select("*").eq("form_id", id).eq("org_id", orgId).is("deleted_at", null).order("sort_order", { ascending: true }),
  ]);
  if (fieldsError) return NextResponse.json({ error: fieldsError.message }, { status: 500 });
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  const newName = `${source.name} (Copy)`;

  // Unique slug within the org. Soft-deleted rows are included in the check
  // because the (org_id, slug) unique key does not ignore them.
  let slug = toSlug(newName) || "form-copy";
  const { data: taken } = await db
    .from("crm_forms")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", slug)
    .limit(1);
  if ((taken ?? []).length > 0) slug = `${slug}-${Date.now().toString(36)}`;

  const { data: newForm, error: formError } = await db
    .from("crm_forms")
    .insert({
      org_id: orgId,
      name: newName,
      slug,
      description: source.description ?? null,
      status: "draft",
      settings: source.settings ?? {},
      auto_manage_accounts: source.auto_manage_accounts ?? false,
      account_matching_strategy: source.account_matching_strategy ?? "email",
      account_update_strategy: source.account_update_strategy ?? "add_new",
      created_by: user.id,
    })
    .select()
    .single();
  if (formError || !newForm) {
    return NextResponse.json({ error: formError?.message ?? "Failed to copy form" }, { status: 500 });
  }

  // Compensating cleanup: if fields/rules fail partway, soft-delete the
  // half-built copy rather than leaving an empty form behind.
  async function abandonCopy(message: string) {
    await db.from("crm_forms").update({ deleted_at: new Date().toISOString() }).eq("id", newForm.id).eq("org_id", orgId);
    logger.error("form copy failed", { formId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldRows: any[] = sourceFields ?? [];
  // Copied field ids are generated here, not read back from the insert, so the
  // old -> new mapping never depends on the order Postgres returns rows in.
  const idMap = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fieldRows.map((f: any) => [f.id as string, crypto.randomUUID()] as const),
  );
  if (fieldRows.length > 0) {
    const { error } = await db
      .from("crm_form_fields")
      .insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fieldRows.map((f: any) => ({
          id: idMap.get(f.id as string),
          form_id: newForm.id,
          org_id: orgId,
          field_type: f.field_type,
          label: f.label,
          placeholder: f.placeholder ?? null,
          description: f.description ?? null,
          required: f.required,
          sort_order: f.sort_order,
          page_number: f.page_number ?? 1,
          mapped_field: f.mapped_field ?? null,
          options: f.options ?? null,
          config: f.config ?? {},
        }))
      )
      .select("id");
    if (error) return abandonCopy(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ruleRows: any[] = sourceRules ?? [];
  if (ruleRows.length > 0) {
    // Drop rules whose source field isn't in the copy (shouldn't happen —
    // deleting a field soft-deletes its rules — but never point at the original).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserts = ruleRows.flatMap((r: any) => {
      let sourceFieldId: string | null = null;
      if (r.source_field_id) {
        sourceFieldId = idMap.get(r.source_field_id) ?? null;
        if (!sourceFieldId) return [];
      }
      // show/hide_field carry a field id in action_value; jump_to_page carries
      // a page number and add/remove_tag a tag id — those are copied verbatim.
      let actionValue: string | null = r.action_value ?? null;
      if ((r.action === "show_field" || r.action === "hide_field") && actionValue) {
        actionValue = idMap.get(actionValue) ?? null;
        if (!actionValue) return [];
      }
      return [{
        form_id: newForm.id,
        org_id: orgId,
        source_field_id: sourceFieldId,
        rule_type: r.rule_type,
        operator: r.operator,
        operand: r.operand ?? null,
        action: r.action,
        action_value: actionValue,
        sort_order: r.sort_order,
        created_by: user.id,
      }];
    });
    if (inserts.length > 0) {
      const { error } = await db.from("crm_form_rules").insert(inserts);
      if (error) return abandonCopy(error.message);
    }
  }

  return NextResponse.json(newForm, { status: 201 });
}
