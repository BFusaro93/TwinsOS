import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/integrations/quickbooks";

/** POST /api/integrations/quickbooks/disconnect — admin-only. Revokes the token and removes the connection. */
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
    const config = row.config as { refresh_token?: string } | null;
    if (config?.refresh_token) await revokeToken(config.refresh_token);
    await supabase.from("integrations").delete().eq("id", row.id);
  }

  return NextResponse.json({ ok: true });
}
