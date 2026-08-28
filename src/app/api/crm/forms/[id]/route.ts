import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("org_id").eq("id", userId).single();
  return data?.org_id ?? null;
}

// GET /api/crm/forms/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const { data: form, error } = await db
    .from("crm_forms")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();

  if (error || !form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: fields } = await db
    .from("crm_form_fields")
    .select("*")
    .eq("form_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  // head: true means Supabase returns the row count on `count`, not `data`
  // (data is null for a head request) — this previously destructured `data`
  // and always got 0, so the Responses tab label always read "Responses (0)".
  const { count: responseCount } = await db
    .from("crm_form_responses")
    .select("id", { count: "exact", head: true })
    .eq("form_id", id)
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedFields = (fields ?? []).map((f: any) => ({
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

  return NextResponse.json({
    id: form.id,
    name: form.name,
    slug: form.slug,
    description: form.description,
    status: form.status,
    settings: form.settings ?? {},
    autoManageAccounts: form.auto_manage_accounts ?? false,
    accountMatchingStrategy: form.account_matching_strategy ?? "email",
    accountUpdateStrategy: form.account_update_strategy ?? "add_new",
    responseCount: responseCount ?? 0,
    createdAt: form.created_at,
    updatedAt: form.updated_at,
    fields: mappedFields,
  });
}

// PATCH /api/crm/forms/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const body = await req.json();
  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.description !== undefined) allowed.description = body.description;
  if (body.status !== undefined) allowed.status = body.status;
  if (body.settings !== undefined) allowed.settings = body.settings;
  if (body.autoManageAccounts !== undefined) allowed.auto_manage_accounts = body.autoManageAccounts;
  if (body.accountMatchingStrategy !== undefined) allowed.account_matching_strategy = body.accountMatchingStrategy;
  if (body.accountUpdateStrategy !== undefined) allowed.account_update_strategy = body.accountUpdateStrategy;

  // crm_forms.slug is only unique per-org (crm_forms_org_id_slug_key) — the
  // public portal at /forms/[slug] resolves the form (and its org) by slug
  // ALONE, with no org in the URL. Two orgs can independently land on the
  // same slug (e.g. both named "Contact Us"); that's harmless while both
  // stay draft, but the moment BOTH are published the public lookup becomes
  // ambiguous and 404s for visitors of both orgs (see
  // crm_forms_slug_published_key, the DB-level backstop for this). Publish
  // is the one action that can trigger that, so resolve it here rather than
  // surfacing a raw constraint-violation error the user has no way to act
  // on — there's no slug editor in the UI.
  if (allowed.status === "published") {
    const { data: form } = await db.from("crm_forms").select("slug").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (form?.slug) {
      const { data: collision } = await db
        .from("crm_forms")
        .select("id")
        .eq("slug", form.slug)
        .eq("status", "published")
        .is("deleted_at", null)
        .neq("id", id)
        .maybeSingle();
      if (collision) {
        allowed.slug = `${form.slug}-${Date.now().toString(36)}`;
      }
    }
  }

  const { data, error } = await db
    .from("crm_forms")
    .update(allowed)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/crm/forms/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const { error } = await db
    .from("crm_forms")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
