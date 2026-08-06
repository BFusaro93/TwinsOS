import {
  buildCanSpamFooter,
  buildClientMergeVars,
  resolveMergeTags,
  sendClientEmail,
} from "@/lib/email/send";

const SEND_CONCURRENCY = 5;

async function sendInBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += SEND_CONCURRENCY) {
    await Promise.all(items.slice(i, i + SEND_CONCURRENCY).map(fn));
  }
}

interface CampaignRow {
  id: string;
  name: string;
  type: string;
  status: string;
  subject: string | null;
  body: string | null;
  target_segment: string;
  audience_client_ids: string[] | null;
}

export type SendCampaignResult =
  | { ok: true; totalRecipients: number; delivered: number; failed: number }
  | { ok: false; error: string };

/**
 * Sends an email campaign to its resolved audience and updates its status —
 * shared by the interactive "Send Now" route (session-scoped) and the
 * scheduled-send cron (service-role, iterates many orgs/campaigns). `db` may
 * be either kind of Supabase client; both expose the same query builder.
 * `createdBy` is the acting user's id for the client_activity log, or null
 * when triggered by the cron (no human actor).
 */
export async function sendCampaignEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  campaign: CampaignRow,
  orgId: string,
  createdBy: string | null
): Promise<SendCampaignResult> {
  if (campaign.type !== "email") {
    return { ok: false, error: "Only email campaigns can be sent from here" };
  }
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return { ok: false, error: "Campaign has already been sent" };
  }
  if (!campaign.subject?.trim() || !campaign.body?.trim()) {
    return { ok: false, error: "Campaign needs a subject and body before sending" };
  }

  let query = db
    .from("clients")
    .select("id, display_name, primary_email, balance_outstanding_cents, unsubscribe_token")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("do_not_market", false)
    .not("primary_email", "is", null);

  if (campaign.target_segment === "custom") {
    query = query.in("id", campaign.audience_client_ids ?? []);
  } else if (campaign.target_segment === "active_clients") {
    query = query.eq("status", "active");
  } else if (campaign.target_segment === "leads") {
    query = query.eq("status", "lead");
  } else if (campaign.target_segment === "past_clients") {
    query = query.in("status", ["inactive", "cancelled"]);
  }

  const { data: recipients, error: recipErr } = await query;
  if (recipErr) return { ok: false, error: recipErr.message };
  if (!recipients || recipients.length === 0) {
    return { ok: false, error: "No eligible recipients (check Do Not Market / missing emails)" };
  }

  const { data: org } = await db
    .from("organizations")
    .select("name, address")
    .eq("id", orgId)
    .single();

  const orgName = org?.name ?? "Your Service Provider";
  const orgAddress = org?.address ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.twinslawnservice.com";

  await db
    .from("crm_campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaign.id);

  let delivered = 0;
  let failed = 0;

  interface Recipient {
    id: string;
    display_name: string | null;
    primary_email: string;
    balance_outstanding_cents: number | null;
    unsubscribe_token: string;
  }

  await sendInBatches(recipients as Recipient[], async (recipient) => {
    const mergeVars = buildClientMergeVars(
      { displayName: recipient.display_name, balanceOutstandingCents: recipient.balance_outstanding_cents },
      { name: orgName, addressPhone: orgAddress?.phone ?? null }
    );
    const resolvedSubject = resolveMergeTags(campaign.subject!, mergeVars);
    const resolvedBody = resolveMergeTags(campaign.body!, mergeVars);
    const unsubscribeUrl = `${appUrl}/api/crm/unsubscribe/${recipient.unsubscribe_token}?campaign=${campaign.id}`;
    const html = resolvedBody + buildCanSpamFooter(orgName, orgAddress, unsubscribeUrl);

    try {
      await sendClientEmail({ to: recipient.primary_email, subject: resolvedSubject, html });
      delivered += 1;
      await db.from("client_activity").insert({
        org_id: orgId,
        client_id: recipient.id,
        activity_type: "email",
        subject: resolvedSubject,
        body: `Campaign "${campaign.name}" sent to ${recipient.primary_email}`,
        sent_to: recipient.primary_email,
        ref_id: campaign.id,
        ref_table: "crm_campaigns",
        occurred_at: new Date().toISOString(),
        created_by: createdBy,
      });
    } catch (err) {
      failed += 1;
      console.error(`[campaign-send] failed for ${recipient.primary_email}:`, err);
    }
  });

  await db.from("crm_campaigns").update({
    status: "completed",
    sent_at: new Date().toISOString(),
    total_recipients: recipients.length,
    delivered_count: delivered,
    updated_at: new Date().toISOString(),
  }).eq("id", campaign.id);

  return { ok: true, totalRecipients: recipients.length, delivered, failed };
}
