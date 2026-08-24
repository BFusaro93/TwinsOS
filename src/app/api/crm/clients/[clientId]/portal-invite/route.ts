import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import type { PortalInviteRow, PortalUserRow } from "@/lib/portal/portal-db";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Block if portal account already exists for this client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("client_portal_users")
    .select("id")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .single() as { data: Pick<PortalUserRow, "id"> | null };

  if (existing) {
    return NextResponse.json({ error: "Client already has a portal account" }, { status: 409 });
  }

  // Revoke any existing pending invites
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_portal_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("accepted_at", null);

  // Create new invite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite, error: inviteErr } = await (supabase as any)
    .from("client_portal_invites")
    .insert({ org_id: profile.org_id, client_id: clientId, email, created_by: user.id })
    .select("token")
    .single() as { data: Pick<PortalInviteRow, "token"> | null; error: unknown };

  if (inviteErr || !invite) {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.twinslawnservice.com";
  const portalUrl = `${appUrl}/portal/register/${invite.token}`;

  // Fetch org branding for email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name")
    .eq("id", profile.org_id)
    .single() as { data: { name: string } | null };

  const orgName = org?.name ?? "Your Service Provider";
  const clientFirstName = client.display_name.split(" ")[0] ?? client.display_name;

  // Send invite email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { error: sendErr } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `You're invited to the ${orgName} Client Portal`,
    html: buildInviteEmail({ orgName, clientFirstName, portalUrl }),
  });

  if (sendErr) {
    // Return the URL anyway so staff can share it manually
    return NextResponse.json({
      success: true,
      inviteUrl: portalUrl,
      emailSent: false,
      emailError: sendErr.message,
    });
  }

  // Log to the client's activity timeline, matching every other client-facing
  // send-email route (estimates, invoices, chemical applications).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("client_activity").insert({
    org_id: profile.org_id,
    client_id: clientId,
    activity_type: "email",
    subject: `Client portal invite sent`,
    body: `Sent to ${email}`,
    sent_to: email,
    created_by: user.id,
    occurred_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, inviteUrl: portalUrl, emailSent: true });
}

function buildInviteEmail({
  orgName,
  clientFirstName,
  portalUrl,
}: {
  orgName: string;
  clientFirstName: string;
  portalUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:#60ab45;padding:28px 40px">
            <p style="margin:0;color:#fff;font-size:22px;font-weight:700">${orgName}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">Hi ${clientFirstName},</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">
              You've been invited to access your ${orgName} Client Portal — a secure place to view your invoices, upcoming services, and estimates.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#475569">
              Click the button below to set up your account. This link expires in <strong>7 days</strong>.
            </p>
            <a href="${portalUrl}" style="display:inline-block;background:#60ab45;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:600">
              Set Up My Account →
            </a>
            <p style="margin:28px 0 0;font-size:13px;color:#94a3b8">
              Or copy this link into your browser:<br>
              <span style="color:#60ab45;word-break:break-all">${portalUrl}</span>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              This invite was sent on behalf of ${orgName}. If you weren't expecting this email, you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
