import { Resend } from "resend";

// Notifies staff when a CLIENT accepts or declines an estimate — via either
// the public proposal link or the logged-in client portal. Separate from the
// internal manager-approval-required notifications (those are gated by
// emailEstimateApproved/Rejected + inAppEstimateApprovalRequired instead).
// Runs from routes that use the service-role client (no staff session), so
// email is sent directly here rather than via the authenticated
// /api/notifications/email endpoint.
export async function notifyStaffOfEstimateDecision(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    estimateId: string;
    estimateNumber: number;
    salesRepId: string | null;
    clientName: string;
    decision: "accepted" | "rejected";
  }
) {
  const { orgId, estimateId, estimateNumber, salesRepId, clientName, decision } = params;

  const { data: admins } = await supabase
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .eq("org_id", orgId)
    .in("role", ["admin", "manager"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recipients: any[] = admins ?? [];
  if (salesRepId && !recipients.some((p) => p.id === salesRepId)) {
    const { data: rep } = await supabase
      .from("profiles")
      .select("id, email, name, notification_prefs")
      .eq("id", salesRepId)
      .single();
    if (rep) recipients = [...recipients, rep];
  }
  if (!recipients.length) return;

  const verb = decision === "accepted" ? "accepted" : "declined";
  const notifType = decision === "accepted" ? "estimate_client_accepted" : "estimate_client_rejected";
  const inAppPrefKey = decision === "accepted" ? "inAppEstimateClientAccepted" : "inAppEstimateClientRejected";
  const emailPrefKey = decision === "accepted" ? "emailEstimateClientAccepted" : "emailEstimateClientRejected";
  const title = `Estimate ${verb} — #${estimateNumber}`;
  const message = `${clientName} ${verb} Estimate #${estimateNumber}.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inAppEligible = recipients.filter((p: any) => (p.notification_prefs ?? {})[inAppPrefKey] !== false);
  if (inAppEligible.length) {
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inAppEligible.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: notifType,
        title,
        message,
        entity_id: estimateId,
        entity_type: "estimate",
      }))
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const emailEligible = recipients.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.email && (p.notification_prefs ?? {})[emailPrefKey] !== false
  );
  if (!emailEligible.length) return;

  const resend = new Resend(resendKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
  const link = `${siteUrl}/crm/estimates/${estimateId}`;
  const color = decision === "accepted" ? "#60ab45" : "#dc2626";

  for (const p of emailEligible) {
    await resend.emails.send({
      from: "Equipt <noreply@twinslawnservice.com>",
      to: p.email,
      subject: title,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Estimate ${verb}</h2>
        <p style="margin:0 0 4px;color:#475569">Hi ${p.name ?? "there"},</p>
        <p style="margin:0 0 24px;color:#475569"><strong>${clientName}</strong> has <strong style="color:${color}">${verb}</strong> Estimate <strong>#${estimateNumber}</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Estimate</a>
      </div>`,
    }).catch(() => {
      // Non-fatal — one recipient's email failing shouldn't block the others
    });
  }
}
