import { Resend } from "resend";
import { resolveBroadcastRecipients } from "@/lib/notify-shared";

// Notifies staff when a contract is signed — same shape as
// estimate-client-notify.ts and ticket-notify.ts: per-recipient pref gating,
// in-app `notifications` row + direct Resend send.
//
// Contracts have no contract_number (unlike estimates/invoices/tickets), so
// notification copy identifies the contract by its title instead.
export async function notifyStaffOfContractSigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    contractId: string;
    contractTitle: string;
    salesRepId: string | null;
  }
) {
  const { orgId, contractId, contractTitle, salesRepId } = params;

  let recipients = await resolveBroadcastRecipients(supabase, orgId, "contractSignedRecipientIds");
  if (salesRepId && !recipients.some((p) => p.id === salesRepId)) {
    const { data: rep } = await supabase
      .from("profiles")
      .select("id, email, name, notification_prefs")
      .eq("id", salesRepId)
      .single();
    if (rep) recipients = [...recipients, rep];
  }
  if (!recipients.length) return;

  const title = `Contract Signed — ${contractTitle}`;
  const message = `${contractTitle} has been signed.`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
  const link = `${siteUrl}/crm/accounting/contracts`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inAppEligible = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppContractSigned !== false);
  if (inAppEligible.length) {
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inAppEligible.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: "contract_signed",
        title,
        message,
        entity_id: contractId,
        entity_type: "contract",
      }))
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const emailEligible = recipients.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.email && (p.notification_prefs ?? {}).emailContractSigned !== false
  );
  if (!emailEligible.length) return;

  const resend = new Resend(resendKey);
  for (const p of emailEligible) {
    await resend.emails.send({
      from: "Equipt <noreply@twinslawnservice.com>",
      to: p.email,
      subject: title,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Contract Signed</h2>
        <p style="margin:0 0 4px;color:#475569">Hi ${p.name ?? "there"},</p>
        <p style="margin:0 0 24px;color:#475569"><strong>${contractTitle}</strong> has been signed.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Contracts</a>
      </div>`,
    }).catch(() => {
      // Non-fatal — one recipient's email failing shouldn't block the others
    });
  }
}
