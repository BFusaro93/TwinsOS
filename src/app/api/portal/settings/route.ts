import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  return profile?.org_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("client_portal_settings")
    .select("*")
    .eq("org_id", orgId)
    .single() as { data: PortalSettingsRow | null };

  return NextResponse.json({ settings: data });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const upsert = {
    org_id: orgId,
    company_name: body.company_name || null,
    logo_url: body.logo_url || null,
    accent_color: body.accent_color || "#60ab45",
    support_email: body.support_email || null,
    support_phone: body.support_phone || null,
    allow_tickets: body.allow_tickets ?? true,
    allow_estimates: body.allow_estimates ?? true,
    welcome_message: body.welcome_message || null,
    portal_ticket_categories: body.portal_ticket_categories ?? [],
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("client_portal_settings")
    .upsert(upsert, { onConflict: "org_id" });

  if (error) return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  return NextResponse.json({ success: true });
}
