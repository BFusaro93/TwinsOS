import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { EMAIL_FROM } from "@/lib/email/send";
import { assertOrgWritable } from "@/lib/org-writable";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";

const log = logger.child("users-invite");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    .select("org_id, role, status")
    .eq("id", user.id)
    .single();
  if (profileErr || !callerProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }
  // A deactivated admin's access token stays valid for up to an hour after
  // the ban; these routes use the service role, so RLS can't stop them.
  if (callerProfile.status === "inactive") {
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }
  if (callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // Service-role writes below target profiles.org_id (the staff member's HOME
  // org) — refuse while impersonating another tenant.
  const impersonating = await rejectIfImpersonating(supabase, user.id);
  if (impersonating) return impersonating;

  // Service-role writes below bypass the canceled-org read-only RLS.
  const readOnly = await assertOrgWritable(supabase, callerProfile.org_id);
  if (readOnly) return readOnly;

  // 2. Parse and validate the request body.
  let body: { email?: string; name?: string; role?: string; crmRoleId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email: rawEmail, name, role } = body;
  const crmRoleId = typeof body.crmRoleId === "string" && /^[0-9a-f-]{36}$/i.test(body.crmRoleId) ? body.crmRoleId : null;
  // Trimmed once and used everywhere: the untrimmed value (a pasted address with
  // a trailing space passes the format check below) was sent to the auth API and
  // to Resend, which reject it, so the invite failed with a generic 500.
  const email = typeof rawEmail === "string" ? rawEmail.trim() : rawEmail;
  if (typeof email !== "string" || typeof name !== "string" || typeof role !== "string" || !email.trim() || !name.trim() || !role) {
    return NextResponse.json({ error: "email, name, and role are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const validRoles = ["admin", "manager", "technician", "purchaser", "viewer", "requestor", "crew"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

  // 3. Generate a one-time link. If the user was already invited (orphaned
  //    auth record from a previous attempt), fall back to a recovery link
  //    which lets them set their password on the same /reset-password page.
  // An inactive role grants nothing (has_crm_access requires it), so inviting someone onto one
  // would land them on the "No Landscapt access" screen. Refuse before sending anything.
  if (crmRoleId && role !== "admin" && role !== "crew") {
    const { data: chosenRole } = await adminClient
      .from("crm_roles").select("id, is_active").eq("id", crmRoleId).eq("org_id", callerProfile.org_id).is("deleted_at", null).maybeSingle();
    if (!chosenRole) return NextResponse.json({ error: "That Landscapt role no longer exists." }, { status: 400 });
    if (!chosenRole.is_active) return NextResponse.json({ error: "That Landscapt role is inactive. Activate it or pick another role." }, { status: 400 });
  }

  let linkData: Awaited<ReturnType<typeof adminClient.auth.admin.generateLink>>["data"];
  let linkType: "invite" | "recovery" = "invite";

  const firstTry = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { org_id: callerProfile.org_id, name, role } },
  });

  if (firstTry.error) {
    const msg = firstTry.error.message ?? "";
    if (msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("already registered")) {
      // User exists — send a recovery (set-password) link instead.
      linkType = "recovery";
      const secondTry = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (secondTry.error || !secondTry.data) {
        console.error("generateLink (recovery) error:", secondTry.error);
        return NextResponse.json({ error: "Failed to generate invite link" }, { status: 500 });
      }
      linkData = secondTry.data;
    } else {
      console.error("generateLink error:", firstTry.error);
      return NextResponse.json({ error: "Failed to generate invite link" }, { status: 500 });
    }
  } else {
    linkData = firstTry.data;
  }

  if (!linkData) {
    return NextResponse.json({ error: "Failed to generate invite link" }, { status: 500 });
  }

  // The "already registered" fallback means this email belongs to SOME
  // existing auth user — not necessarily one in the caller's own org. Without
  // this check, an admin in Org A entering an email that happens to belong to
  // an Org B user would silently send that Org B user an unsolicited
  // password-recovery email and flip their profiles.status to "invited"
  // below — a cross-tenant write triggered by an org member with no
  // authority over the other org's data.
  let existingStatus: string | null = null;
  if (linkType === "recovery" && linkData.user) {
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("org_id, status")
      .eq("id", linkData.user.id)
      .maybeSingle();
    if (existingProfile && existingProfile.org_id !== callerProfile.org_id) {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
    }
    // An existing auth user with NO profiles row is not staff of any org -
    // typically a client portal login. Never mint a staff profile in the
    // caller's org for it (and never email it a staff recovery link).
    if (!existingProfile) {
      return NextResponse.json(
        { error: "That email is already tied to a different type of account (such as a client portal login). Use a different email." },
        { status: 409 }
      );
    }
    existingStatus = existingProfile.status ?? null;
    // A deactivated teammate is banned at the auth layer. Re-inviting would
    // email a link that can't sign in and relabel them "invited" while the ban
    // stays — Reactivate is the path that lifts the ban.
    if (existingStatus === "inactive") {
      return NextResponse.json(
        { error: "That user was deactivated. Use Reactivate on the Users page instead of inviting them again." },
        { status: 409 }
      );
    }
  }

  // Build the URL directly so the user lands on /reset-password without
  // needing Supabase's redirect allowlist.
  const hashedToken = linkData.properties?.hashed_token;
  const inviteUrl = hashedToken
    ? `${siteUrl}/reset-password?token_hash=${hashedToken}&type=${linkType}`
    : linkData.properties?.action_link ?? "";

  // 4. Send the invite email via Resend's HTTP API (not SMTP).
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const { data: orgRow } = await adminClient.from("organizations").select("name").eq("id", callerProfile.org_id).maybeSingle();
  const orgName = typeof orgRow?.name === "string" && orgRow.name.trim() ? orgRow.name.trim() : null;

  const { error: emailErr } = await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: orgName ? `You've been invited to ${orgName} on Landscapt` : "You've been invited to Landscapt",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">You've been invited to ${orgName ? escapeHtml(orgName) + " on " : ""}Landscapt</h2>
        <p style="margin:0 0 24px;color:#475569">Hi ${escapeHtml(name)}, you've been added as a <strong>${escapeHtml(role)}</strong> on ${orgName ? escapeHtml(orgName) + "'s" : "your team's"} Landscapt account.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Accept Invitation</a>
        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">This link expires in 24 hours. If you weren't expecting this, you can ignore this email.</p>
      </div>
    `,
  });

  if (emailErr) {
    console.error("Resend error:", emailErr);
    return NextResponse.json({ error: "Failed to send invite email" }, { status: 500 });
  }

  // 5. Update profile status to 'invited' — but never downgrade a user who is
  //    already active (re-sending a set-password link to a current teammate
  //    must not relabel them as a pending invite).
  //    A freshly created invite has no profile yet: the handle_new_user
  //    trigger only creates one when invited_at is set at INSERT time, which
  //    generateLink does not guarantee. Create it here so the user shows up in
  //    the Users list. org_id comes from the caller's session, never the body.
  if (linkData.user && existingStatus !== "active") {
    const { error: profileUpsertErr } = await adminClient.from("profiles").upsert(
      {
        id: linkData.user.id,
        org_id: callerProfile.org_id,
        name,
        email,
        role,
        status: "invited",
      },
      { onConflict: "id" }
    );
    if (profileUpsertErr) {
      console.error("profile upsert error:", profileUpsertErr);
      return NextResponse.json({ error: "Invite sent but the user record could not be created" }, { status: 500 });
    }
  }

  // A non-admin only gets into Landscapt through an employee record carrying a CRM role, so
  // choosing one here creates (or links) that record instead of leaving the invitee at a block screen.
  if (crmRoleId && linkData.user && role !== "admin" && role !== "crew") {
    const { data: roleRow } = await adminClient
      .from("crm_roles").select("id").eq("id", crmRoleId).eq("org_id", callerProfile.org_id).is("deleted_at", null).maybeSingle();
    if (roleRow) {
      const { data: linked } = await adminClient
        .from("crm_employees").select("id").eq("org_id", callerProfile.org_id).eq("user_id", linkData.user.id).is("deleted_at", null).maybeSingle();
      if (linked) {
        await adminClient.from("crm_employees").update({ crm_role_id: crmRoleId }).eq("id", linked.id);
      } else {
        const { data: byEmail } = await adminClient
          .from("crm_employees").select("id").eq("org_id", callerProfile.org_id).is("user_id", null).is("deleted_at", null)
          // Case-insensitive exact match: `_` / `%` in an address are not wildcards.
          .ilike("email", email.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
        if (byEmail) {
          // A re-hired (inactive) employee record linked here must be active again, or
          // has_crm_access() still refuses the login.
          await adminClient.from("crm_employees").update({ user_id: linkData.user.id, crm_role_id: crmRoleId, is_active: true }).eq("id", byEmail.id);
        } else {
          const parts = name.trim().split(/\s+/);
          const firstName = parts[0];
          const lastName = parts.slice(1).join(" ") || "-";
          const { error: empErr } = await adminClient.from("crm_employees").insert({
            org_id: callerProfile.org_id, first_name: firstName, last_name: lastName, email,
            user_id: linkData.user.id, crm_role_id: crmRoleId, is_active: true, created_by: user.id,
          });
          if (empErr) {
            log.error("invite: employee link failed", { error: empErr.message });
            return NextResponse.json({ success: true, warning: "Invite sent, but the employee record could not be created — link them under Team → Employees." }, { status: 200 });
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
