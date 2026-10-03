import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { assertOrgWritable } from "@/lib/org-writable";

const log = logger.child("users-reset-password");

/**
 * POST /api/users/[userId]/reset-password
 * Admin-only. Directly sets a new password for a user via the service role
 * Admin API — needed for crew accounts, which use fake @crew.equipt.app
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
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // Service-role writes below bypass the canceled-org read-only RLS.
  const readOnly = await assertOrgWritable(supabase, callerProfile.org_id);
  if (readOnly) return readOnly;

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();
  if (!targetProfile || targetProfile.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: { password?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { password } = body;
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password (min 8 chars) is required" }, { status: 400 });
  }

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  });
  if (updateError) {
    log.error("password update failed", { error: updateError.message });
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
