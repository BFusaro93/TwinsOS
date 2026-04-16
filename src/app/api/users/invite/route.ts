import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  // 1. Validate the calling user's session and confirm they are an admin.
  const supabase = await createServerClient();
  const {
    data: { user },
    error: sessionErr,
  } = await supabase.auth.getUser();
  if (sessionErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile, error: profileErr } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (profileErr || !callerProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }
  if (callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // 2. Parse and validate the request body.
  let body: { email?: string; name?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, role } = body;
  if (!email || !name || !role) {
    return NextResponse.json({ error: "email, name, and role are required" }, { status: 400 });
  }

  const validRoles = ["admin", "manager", "technician", "purchaser", "viewer", "requestor"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // 3. Use the service role client to invite the user via Supabase Auth Admin.
  //    This requires SUPABASE_SERVICE_ROLE_KEY to be set in the environment.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        org_id: callerProfile.org_id,
        name,
        role,
      },
    }
  );
  if (inviteErr) {
    const errMsg = inviteErr.message || (inviteErr as { code?: string }).code || JSON.stringify(inviteErr);
    console.error("inviteUserByEmail error:", inviteErr);
    return NextResponse.json({ error: errMsg || "Failed to send invite email" }, { status: 500 });
  }

  // 4. The handle_new_user trigger creates the profile row automatically.
  //    Update its status to 'invited' so the Users page shows the correct badge.
  if (inviteData.user) {
    await adminClient
      .from("profiles")
      .update({ status: "invited" })
      .eq("id", inviteData.user.id);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
