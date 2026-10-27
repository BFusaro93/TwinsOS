import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { assertOrgWritable } from "@/lib/org-writable";
import { getActiveImpersonationOrg } from "@/lib/auth/impersonation-guard";

const log = logger.child("users-reset-password");

/**
 * POST /api/users/[userId]/reset-password
 * Admin-only. Directly sets a new password for a user via the service role
 * Admin API — needed for crew accounts, which use fake @crew.landscapt.com
 * addresses and can't receive a normal password-reset email.
 * Body: { password: string }
 */
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
  // A deactivated admin's token outlives the ban by up to an hour; without
  // this they could still set any teammate's password via the service role.
  if (callerProfile?.status === "inactive") {
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }
  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // A staff member impersonating a customer org resets passwords inside THAT
  // org (support for crew logins, which have fake addresses and can't get a
  // reset email); everyone else is confined to their own.
  const impersonatedOrgId = await getActiveImpersonationOrg(supabase, user.id);
  const effectiveOrgId = impersonatedOrgId ?? callerProfile.org_id;

  // Service-role writes below bypass the canceled-org read-only RLS.
  const readOnly = await assertOrgWritable(supabase, effectiveOrgId);
  if (readOnly) return readOnly;

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Read the target with the service role so the org check below is the only
  // thing deciding visibility (the caller's RLS view shifts under impersonation).
  const { data: targetProfile } = await adminClient
    .from("profiles")
    .select("org_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!targetProfile || targetProfile.org_id !== effectiveOrgId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Least privilege while impersonating: a password reset on a real person's
  // login is an account takeover, so staff may only reset shared crew logins.
  if (impersonatedOrgId && targetProfile.role !== "crew") {
    return NextResponse.json(
      { error: "While impersonating, staff can reset passwords for shared crew logins only. Ask the organization's admin to reset other users' passwords." },
      { status: 403 }
    );
  }

  let body: { password?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { password } = body;
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password (min 8 chars) is required" }, { status: 400 });
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  });
  if (updateError) {
    log.error("password update failed", { error: updateError.message });
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }

  if (impersonatedOrgId) {
    log.info("staff reset crew password during impersonation", { staffId: user.id, orgId: impersonatedOrgId, targetId: userId });
  }

  return NextResponse.json({ success: true });
}
