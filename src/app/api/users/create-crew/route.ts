import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { assertOrgWritable } from "@/lib/org-writable";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";
import { FALLBACK_CREW_COLORS } from "@/components/crm/dispatch/crew-color";

const log = logger.child("users-create-crew");

/**
 * POST /api/users/create-crew
 * Creates a shared crew account (no email invite needed).
 * Admin-only. Generates a login email from the team slug.
 * Body: { teamName: string; password: string }
 * Also gives the login a Landscapt crew (crm_crews.user_id) so the Crew App has
 * a schedule to show: an existing unlinked crew with the same name is linked,
 * otherwise a new one is created. Either stays editable/unlinkable in
 * Landscapt → Team → Crews.
 * Returns: { success: true; loginEmail: string; crew: "created" | "linked" | "failed" }
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
    .select("org_id, role, status")
    .eq("id", user.id)
    .single();
  // A deactivated admin's token outlives the ban by up to an hour and this
  // route uses the service role, so RLS can't stop it.
  if (callerProfile?.status === "inactive") {
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }
  if (profileErr || !callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // Service-role writes below target profiles.org_id (the staff member's HOME
  // org) — refuse while impersonating another tenant.
  const impersonating = await rejectIfImpersonating(supabase, user.id);
  if (impersonating) return impersonating;

  // Service-role writes below bypass the canceled-org read-only RLS.
  const readOnly = await assertOrgWritable(supabase, callerProfile.org_id);
  if (readOnly) return readOnly;

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
    // Short org id keeps auto emails unique per tenant (a bare slug collided
    // across orgs and revealed that another org used the same team name).
    const orgTag = String(callerProfile.org_id).replace(/-/g, "").slice(0, 8);
    loginEmail = `${slug || "crew"}-${orgTag}@crew.landscapt.com`;
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
    // Supabase's leaked-password check (HaveIBeenPwned) rejects common
    // passwords — a user-fixable 422, not a server error.
    if (createErr?.code === "weak_password" || msg.toLowerCase().includes("weak")) {
      return NextResponse.json(
        { error: "That password is too common or has appeared in a known data breach. Choose a longer, less guessable password." },
        { status: 422 }
      );
    }
    log.error("create crew account failed", { error: msg });
    return NextResponse.json({ error: "Failed to create crew account" }, { status: 500 });
  }

  // 5. Create the profile row. The signup trigger skips service-role-created
  // users, so this is the only place it gets made. `email` is NOT NULL on
  // profiles — leaving it out made this fail silently for every crew account
  // (login created, but no profile: invisible in Settings → Users, missing
  // from the Linked Login picker, and the credentials couldn't sign in to
  // anything). A failure here must not leave a half-made account behind, so
  // undo the auth user and report the error.
  const { error: upsertErr } = await adminClient
    .from("profiles")
    .upsert({
      id: createdUser.user.id,
      org_id: callerProfile.org_id,
      name: teamName.trim(),
      email: loginEmail,
      role: "crew",
      status: "active",
    }, { onConflict: "id" });

  if (upsertErr) {
    log.error("crew profile upsert failed", { error: upsertErr.message });
    const { error: cleanupErr } = await adminClient.auth.admin.deleteUser(createdUser.user.id);
    if (cleanupErr) log.error("crew auth user cleanup failed", { error: cleanupErr.message });
    return NextResponse.json({ error: "Failed to create crew account" }, { status: 500 });
  }

  // 6. Give the login a Landscapt crew. Non-fatal: the account already works,
  // and the crew can still be linked by hand in Landscapt → Team → Crews.
  const crew = await linkOrCreateCrew(adminClient, {
    orgId: callerProfile.org_id,
    teamName: teamName.trim(),
    userId: createdUser.user.id,
    createdBy: user.id,
  });

  return NextResponse.json({ success: true, loginEmail, crew }, { status: 200 });
}

async function linkOrCreateCrew(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  { orgId, teamName, userId, createdBy }: { orgId: string; teamName: string; userId: string; createdBy: string }
): Promise<"created" | "linked" | "failed"> {
  const { data: crews, error: listErr } = await db
    .from("crm_crews")
    .select("id, name, color, user_id")
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (listErr) {
    log.error("crew lookup failed", { error: listErr.message });
    return "failed";
  }
  const rows = (crews ?? []) as { id: string; name: string; color: string | null; user_id: string | null }[];

  // Same-name crew with no login yet: link it rather than duplicating the team.
  const existing = rows.find(
    (c) => !c.user_id && c.name.trim().toLowerCase() === teamName.toLowerCase()
  );
  if (existing) {
    const { error } = await db.from("crm_crews").update({ user_id: userId }).eq("id", existing.id);
    if (error) {
      log.error("crew link failed", { error: error.message });
      return "failed";
    }
    return "linked";
  }

  const used = new Set(rows.map((c) => c.color?.toLowerCase()));
  const color = FALLBACK_CREW_COLORS.find((c) => !used.has(c)) ?? null;
  const { error } = await db.from("crm_crews").insert({
    org_id: orgId,
    name: teamName,
    user_id: userId,
    color,
    show_in_calendar: true,
    created_by: createdBy,
  });
  if (error) {
    log.error("crew create failed", { error: error.message });
    return "failed";
  }
  return "created";
}
