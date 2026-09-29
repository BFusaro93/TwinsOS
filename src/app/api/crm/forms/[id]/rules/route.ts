import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/crm/forms/[id]/rules
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  // Verify org ownership via the form
  const { data: form } = await db
    .from("crm_forms").select("id").eq("id", id).eq("org_id", profile.org_id).maybeSingle();
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: rules, error } = await db
    .from("crm_form_rules")
    .select("*")
    .eq("form_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (rules ?? []).map((r: any) => ({
    id: r.id,
    formId: r.form_id,
    sourceFieldId: r.source_field_id,
    ruleType: r.rule_type,
    operator: r.operator,
    operand: r.operand,
    action: r.action,
    actionValue: r.action_value,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }));

  return NextResponse.json(mapped);
}

// PUT /api/crm/forms/[id]/rules  — replace all rules
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const { data: form } = await db
    .from("crm_forms").select("id").eq("id", id).eq("org_id", profile.org_id).maybeSingle();
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const rules: Array<{
    sourceFieldId: string | null;
    ruleType: string;
    operator: string;
    operand: string | null;
    action: string;
    actionValue: string | null;
    sortOrder: number;
  }> = body.rules ?? [];

  // Remember the rules being replaced, but only soft-delete them AFTER the new
  // set is inserted — deleting first meant a failed insert (bad rule_type,
  // etc.) returned an error with every existing rule already gone.
  const { data: previousRules, error: previousError } = await db
    .from("crm_form_rules")
    .select("id")
    .eq("form_id", id)
    .is("deleted_at", null);
  if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previousIds: string[] = (previousRules ?? []).map((r: any) => r.id as string);

  if (rules.length > 0) {
    const inserts = rules.map((r, i) => ({
      form_id: id,
      org_id: profile.org_id,
      source_field_id: r.sourceFieldId ?? null,
      rule_type: r.ruleType,
      operator: r.operator,
      operand: r.operand ?? null,
      action: r.action,
      action_value: r.actionValue ?? null,
      sort_order: r.sortOrder ?? i,
      created_by: user.id,
    }));
    const { error } = await db.from("crm_form_rules").insert(inserts);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (previousIds.length > 0) {
    const { error: deleteError } = await db
      .from("crm_form_rules")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", previousIds);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Same gap as the fields route — rule edits only ever touched
  // crm_form_rules, never the parent form's updated_at.
  await db.from("crm_forms").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true });
}
