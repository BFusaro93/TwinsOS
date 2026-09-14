import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
    .select("org_id")
    .eq("id", userId)
    .single();
  if (!targetProfile || targetProfile.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Ban first — this is what actually revokes access (blocks sign-in and
  // invalidates future token refreshes). The status flag alone is just a
  // label the Users list reads; nothing else in the app enforces it.
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN_DURATION,
  });
  if (banError) {
    return NextResponse.json({ error: banError.message }, { status: 500 });
  }

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ status: "inactive" })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
