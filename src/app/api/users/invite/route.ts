import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";

  // 3. Generate a one-time link. If the user was already invited (orphaned
  //    auth record from a previous attempt), fall back to a recovery link
  //    which lets them set their password on the same /reset-password page.
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
        options: { data: { org_id: callerProfile.org_id, name, role } },
      });
      if (secondTry.error || !secondTry.data) {
        console.error("generateLink (recovery) error:", secondTry.error);
        return NextResponse.json({ error: secondTry.error?.message || "Failed to generate invite link" }, { status: 500 });
      }
      linkData = secondTry.data;
    } else {
      console.error("generateLink error:", firstTry.error);
      return NextResponse.json({ error: firstTry.error.message || "Failed to generate invite link" }, { status: 500 });
    }
  } else {
    linkData = firstTry.data;
  }

  if (!linkData) {
    return NextResponse.json({ error: "Failed to generate invite link" }, { status: 500 });
  }

  // Build the URL directly so the user lands on /reset-password without
  // needing Supabase's redirect allowlist.
  const hashedToken = linkData.properties?.hashed_token;
  const inviteUrl = hashedToken
    ? `${siteUrl}/reset-password?token_hash=${hashedToken}&type=${linkType}`
    : linkData.properties?.action_link ?? "";

  // 4. Send the invite email via Resend's HTTP API (not SMTP).
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const { error: emailErr } = await resend.emails.send({
    from: "Twins Lawn Service <noreply@twinslawnservice.com>",
    to: email,
    subject: "You've been invited to Equipt",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">You've been invited to Equipt</h2>
        <p style="margin:0 0 24px;color:#475569">Hi ${name}, you've been added as a <strong>${role}</strong> on your team's Equipt account.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Accept Invitation</a>
        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">This link expires in 24 hours. If you weren't expecting this, you can ignore this email.</p>
      </div>
    `,
  });

  if (emailErr) {
    console.error("Resend error:", emailErr);
    return NextResponse.json({ error: "Failed to send invite email" }, { status: 500 });
  }

  // 5. Update profile status to 'invited'.
  if (linkData.user) {
    await adminClient
      .from("profiles")
      .update({ status: "invited" })
      .eq("id", linkData.user.id);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
