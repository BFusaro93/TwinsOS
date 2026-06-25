import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/crm/forms
export async function GET() {
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

  // Fetch forms + response counts
  const { data: forms, error } = await db
    .from("crm_forms")
    .select(`
      id, name, slug, description, status, settings,
      auto_manage_accounts, account_matching_strategy, account_update_strategy,
      created_at, updated_at,
      crm_form_responses(count)
    `)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (forms ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    description: f.description,
    status: f.status,
    settings: f.settings ?? {},
    autoManageAccounts: f.auto_manage_accounts ?? false,
    accountMatchingStrategy: f.account_matching_strategy ?? "email",
    accountUpdateStrategy: f.account_update_strategy ?? "add_new",
    responseCount: f.crm_form_responses?.[0]?.count ?? 0,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }));

  return NextResponse.json(mapped);
}

// POST /api/crm/forms
export async function POST(req: Request) {
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

  const body = await req.json();
  const { name, description, status = "draft" } = body;

  // Ensure unique slug within org
  let slug = toSlug(name || "form");
  const { data: existing } = await db
    .from("crm_forms")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const { data, error } = await db
    .from("crm_forms")
    .insert({
      org_id: profile.org_id,
      name,
      slug,
      description: description || null,
      status,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
