import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const log = logger.child("users-deactivate");

// Effectively permanent — GoTrue's ban_duration has no "forever" option, so a
// very long duration is the standard way to represent one (mirrors Supabase's
// own documented workaround).
const PERMANENT_BAN_DURATION = "876000h";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("org_id, status")
    .eq("id", userId)
    .single();
  if (!targetProfile || targetProfile.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Profile first: its trigger holds the last-active-admin guard (with a
  // per-org advisory lock), so a deactivation that would strand the org
  // without an admin fails HERE — before the auth user is banned. Banning
  // first used to leave the last admin banned but still "active".
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ status: "inactive" })
    .eq("id", userId);
  if (updateError) {
    log.error("profile update failed", { error: updateError.message });
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }

  // The ban is what actually revokes access (blocks sign-in and invalidates
  // future token refreshes).
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN_DURATION,
  });
  if (banError) {
    // Don't leave the user labeled inactive while still able to sign in.
    await adminClient
      .from("profiles")
      .update({ status: targetProfile.status ?? "active" })
      .eq("id", userId);
    log.error("ban failed", { error: banError.message });
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }

  // The GoTrue ban doesn't reach MCP/OAuth tokens — those are our own rows
  // (checked by lib/api/auth.ts), so revoke them explicitly.
  const { error: revokeError } = await adminClient
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (revokeError) {
    log.error("session revoke failed", { error: revokeError.message });
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
