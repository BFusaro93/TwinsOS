import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/users/create-crew
 * Creates a shared crew account (no email invite needed).
 * Admin-only. Generates a login email from the team slug.
 * Body: { teamName: string; password: string }
 * Returns: { success: true; loginEmail: string }
 */
export async function POST(request: Request) {
  // 1. Validate caller is admin
  const supabase = await createServerClient();
  const { data: { user }, error: sessionErr } = await supabase.auth.getUser();
  if (sessionErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: callerProfile, error: profileErr } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (profileErr || !callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // 2. Parse body
  let body: { teamName?: string; password?: string; customEmail?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { teamName, password, customEmail } = body;
  if (!teamName?.trim() || !password || password.length < 8) {
    return NextResponse.json(
      { error: "teamName and password (min 8 chars) are required" },
      { status: 400 }
    );
  }

  // 3. Determine login email — use custom if provided, otherwise auto-generate
  let loginEmail: string;
  if (customEmail?.trim()) {
    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customEmail.trim())) {
      return NextResponse.json({ error: "Invalid email address format." }, { status: 400 });
    }
    loginEmail = customEmail.trim().toLowerCase();
  } else {
    const slug = teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    loginEmail = `${slug}@crew.equipt.app`;
  }

  // 4. Create the auth user with the service role client (no email confirmation needed)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: {
      name: teamName.trim(),
      role: "crew",
      org_id: callerProfile.org_id,
    },
  });

  if (createErr || !createdUser?.user) {
    const msg = createErr?.message ?? "Failed to create crew account";
    // If email already taken, surface a useful error
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered")) {
      return NextResponse.json({ error: `A crew account for "${teamName}" already exists (${loginEmail}).` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 5. Ensure profile row exists (the DB trigger may have already inserted it)
  const { error: upsertErr } = await adminClient
    .from("profiles")
    .upsert({
      id: createdUser.user.id,
      org_id: callerProfile.org_id,
      name: teamName.trim(),
      role: "crew",
      status: "active",
    }, { onConflict: "id" });

  if (upsertErr) {
    // Non-fatal — log and continue
    console.error("[create-crew] profile upsert error:", upsertErr);
  }

  return NextResponse.json({ success: true, loginEmail }, { status: 200 });
}
