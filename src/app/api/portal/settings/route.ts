import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { firstIssueMessage } from "@/lib/utils/zod-message";

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  // Staff impersonating an org act on that org (profiles.org_id is their own).
  return (await getEffectiveOrgId(supabase)) ?? profile?.org_id ?? null;
}

const optText = (max: number) => z.string().max(max).nullish();
const SettingsSchema = z.object({
  company_name: optText(200),
  // Rendered into <img src> on the portal — must be an http(s) URL.
  logo_url: z.string().max(2000).regex(/^https?:\/\//i, "logo_url must be an http(s) URL").nullish().or(z.literal("")),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "accent_color must be a hex color").nullish().or(z.literal("")),
  support_email: z.string().max(254).email().nullish().or(z.literal("")),
  support_phone: optText(50),
  allow_tickets: z.boolean().nullish(),
  allow_estimates: z.boolean().nullish(),
  allow_documents: z.boolean().nullish(),
  welcome_message: optText(2000),
  portal_ticket_categories: z.array(z.string().trim().min(1).max(100)).max(50).nullish(),
  email_support_on_new_ticket: z.boolean().nullish(),
  allow_autopay: z.boolean().nullish(),
  allow_card_management: z.boolean().nullish(),
  // Cents; null/absent = no limit. Capped at $1M so a typo can't overflow the integer column.
  card_max_payment_cents: z.number().int().min(1).max(100_000_000).nullish(),
  ach_max_payment_cents: z.number().int().min(1).max(100_000_000).nullish(),
  show_upcoming_services: z.boolean().nullish(),
  show_service_history: z.boolean().nullish(),
});

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

  const parsedBody = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error, "Invalid input") }, { status: 400 });
  }
  const body = parsedBody.data;

  const upsert = {
    org_id: orgId,
    company_name: body.company_name || null,
    logo_url: body.logo_url || null,
    accent_color: body.accent_color || "#60ab45",
    support_email: body.support_email || null,
    support_phone: body.support_phone || null,
    allow_tickets: body.allow_tickets ?? true,
    allow_estimates: body.allow_estimates ?? true,
    allow_documents: body.allow_documents ?? true,
    welcome_message: body.welcome_message || null,
    portal_ticket_categories: body.portal_ticket_categories ?? [],
    email_support_on_new_ticket: body.email_support_on_new_ticket ?? false,
    allow_autopay: body.allow_autopay ?? true,
    allow_card_management: body.allow_card_management ?? true,
    card_max_payment_cents: body.card_max_payment_cents ?? null,
    ach_max_payment_cents: body.ach_max_payment_cents ?? null,
    show_upcoming_services: body.show_upcoming_services ?? true,
    show_service_history: body.show_service_history ?? true,
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("client_portal_settings")
    .upsert(upsert, { onConflict: "org_id" });

  if (error) return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  return NextResponse.json({ success: true });
}
