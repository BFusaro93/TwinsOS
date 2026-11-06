import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken, resolveQuickBooksEnvironment, type QuickBooksEnvironment } from "@/lib/integrations/quickbooks";

/**
 * POST /api/integrations/quickbooks/disconnect — admin-only. Revokes the token and turns the
 * connection off. The row is kept WITHOUT its tokens, so a later reconnect knows which QuickBooks
 * company this org used: reconnecting the same one keeps every customer/invoice/payment link
 * (wiping them made the next sync create duplicates of everything already there), while
 * connecting a different one clears them (see the callback).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can disconnect QuickBooks" }, { status: 403 });
  }

  const { data: row } = await supabase
    .from("integrations")
    .select("id, config")
    .eq("org_id", profile.org_id)
    .eq("provider", "quickbooks")
    .maybeSingle();

  if (row) {
    const config = row.config as { refresh_token?: string; environment?: QuickBooksEnvironment; realm_id?: string; connected_at?: string } | null;
    if (config?.refresh_token) await revokeToken(config.refresh_token, config.environment ?? resolveQuickBooksEnvironment(profile.org_id));
    const { error } = await supabase
      .from("integrations")
      .update({
        enabled: false,
        config: {
          realm_id: config?.realm_id ?? null,
          environment: config?.environment ?? null,
          connected_at: config?.connected_at ?? null,
          disconnected_at: new Date().toISOString(),
        },
      })
      .eq("id", row.id);
    if (error) return NextResponse.json({ error: "Failed to disconnect QuickBooks" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
