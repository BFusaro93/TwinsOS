import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

export async function GET() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const [clientRes, settingsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name, first_name, last_name, primary_email, primary_phone, balance_outstanding_cents, balance_credits_cents")
      .eq("id", ctx.clientId)
      .single(),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("company_name, logo_url, accent_color, support_email, support_phone, allow_tickets, allow_estimates, welcome_message")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: PortalSettingsRow | null }>,
  ]);

  return NextResponse.json({
    client: clientRes.data,
    settings: settingsRes.data ?? {
      company_name: null,
      logo_url: null,
      accent_color: "#60ab45",
      support_email: null,
      support_phone: null,
      allow_tickets: true,
      allow_estimates: true,
      welcome_message: null,
    },
    orgId: ctx.orgId,
  });
}
