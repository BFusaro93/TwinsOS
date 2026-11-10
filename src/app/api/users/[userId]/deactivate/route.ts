import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";
import { z } from "zod";

const log = logger.child("users-deactivate");

// Effectively permanent — GoTrue's ban_duration has no "forever" option, so a
// very long duration is the standard way to represent one (mirrors Supabase's
// own documented workaround).
const PERMANENT_BAN_DURATION = "876000h";

/** Optional body. `revokeApiKeys`: also revoke the API keys this person created
 *  (the deactivate dialog lists them, checked by default). */
const DeactivateBody = z.object({ revokeApiKeys: z.boolean().optional() });

/** The last-active-admin guard's message from prevent_profile_role_escalation(). */
function guardMessage(err: { code?: string; message?: string } | null): string | null {
  return err?.code === "P0001" && err.message ? err.message : null;
}

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
    .select("org_id, role, status")
    .eq("id", user.id)
    .single();
  // Deactivated admin with a not-yet-expired token: service role below.
  if (callerProfile?.status === "inactive") {
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }
  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // These routes compare the target's org with the caller's HOME org, so during
  // a staff impersonation every target "isn't found" — say why instead.
  const impersonating = await rejectIfImpersonating(supabase, user.id);
  if (impersonating) return impersonating;

  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
  }

  const parsedBody = DeactivateBody.safeParse(await request.json().catch(() => ({})));
  const revokeApiKeys = parsedBody.success ? parsedBody.data.revokeApiKeys === true : false;

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
    // "This is the last active admin — promote another admin first."
    const guard = guardMessage(updateError);
    if (guard) return NextResponse.json({ error: guard }, { status: 409 });
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

  // A login and its employee record are one person: deactivating either
  // deactivates the other (owner decision), so the employee drops off crew
  // lists, pickers and has_crm_access() along with the login.
  const { error: employeeError } = await adminClient
    .from("crm_employees")
    .update({ is_active: false })
    .eq("org_id", callerProfile.org_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  let revokedKeys = 0;
  if (revokeApiKeys) {
    const { data: revoked, error: keyError } = await adminClient
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("org_id", callerProfile.org_id)
      .eq("created_by", userId)
      .is("revoked_at", null)
      .is("deleted_at", null)
      .select("id");
    if (keyError) {
      log.error("api key revoke failed", { error: keyError.message });
      return NextResponse.json(
        { error: "The user was deactivated, but their API keys could not be revoked. Revoke them under Settings → Integrations." },
        { status: 500 }
      );
    }
    revokedKeys = revoked?.length ?? 0;
  }

  if (employeeError) {
    log.error("employee deactivate failed", { error: employeeError.message });
    return NextResponse.json({
      success: true,
      revokedKeys,
      warning: "The login was deactivated, but their employee record could not be — deactivate it under Team → Employees.",
    });
  }

  return NextResponse.json({ success: true, revokedKeys });
}
