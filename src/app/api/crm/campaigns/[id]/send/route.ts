import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  const { id: campaignId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign } = await (supabase as any)
    .from("crm_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.type !== "email") {
    return NextResponse.json({ error: "Only email campaigns can be sent from here" }, { status: 422 });
  }
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign has already been sent" }, { status: 422 });
  }
  if (!campaign.subject?.trim() || !campaign.body?.trim()) {
    return NextResponse.json({ error: "Campaign needs a subject and body before sending" }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("clients")
    .select("id, display_name, primary_email, balance_outstanding_cents, unsubscribe_token")
    .eq("org_id", profile.org_id)
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
  if (recipErr) return NextResponse.json({ error: recipErr.message }, { status: 500 });
  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: "No eligible recipients (check Do Not Market / missing emails)" }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, address")
    .eq("id", profile.org_id)
    .single();

  const orgName = org?.name ?? "Your Service Provider";
  const orgAddress = org?.address ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.twinslawnservice.com";

  await (supabase as any)
    .from("crm_campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId);

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
    const resolvedSubject = resolveMergeTags(campaign.subject, mergeVars);
    const resolvedBody = resolveMergeTags(campaign.body, mergeVars);
    const unsubscribeUrl = `${appUrl}/api/crm/unsubscribe/${recipient.unsubscribe_token}?campaign=${campaignId}`;
    const html = resolvedBody + buildCanSpamFooter(orgName, orgAddress, unsubscribeUrl);

    try {
      await sendClientEmail({ to: recipient.primary_email, subject: resolvedSubject, html });
      delivered += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        org_id: profile.org_id,
        client_id: recipient.id,
        activity_type: "email",
        subject: resolvedSubject,
        body: `Campaign "${campaign.name}" sent to ${recipient.primary_email}`,
        sent_to: recipient.primary_email,
        ref_id: campaignId,
        ref_table: "crm_campaigns",
        occurred_at: new Date().toISOString(),
        created_by: user.id,
      });
    } catch (err) {
      failed += 1;
      console.error(`[campaign-send] failed for ${recipient.primary_email}:`, err);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("crm_campaigns").update({
    status: "completed",
    sent_at: new Date().toISOString(),
    total_recipients: recipients.length,
    delivered_count: delivered,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);

  return NextResponse.json({ totalRecipients: recipients.length, delivered, failed });
}
