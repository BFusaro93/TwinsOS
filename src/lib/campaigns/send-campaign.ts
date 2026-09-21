import {
  buildCanSpamFooter,
  buildClientMergeVars,
  resolveMergeTags,
  sendClientEmail,
} from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";

const SEND_CONCURRENCY = 5;
// A campaign claimed into "sending" sets updated_at to the claim time (see
// the conditional UPDATE below) and nothing touches updated_at again until
// the final "completed" update — so a "sending" row whose updated_at is
// older than this is a route that died mid-send (e.g. hit the platform's
// function timeout) rather than one that's genuinely still in flight.
// Treat it as eligible for a retry rather than permanently stuck.
const STUCK_SENDING_THRESHOLD_MS = 15 * 60 * 1000;
// Delay between concurrent-send batches so we stay under Resend's default
// rate limit (2 req/sec) — 5 concurrent sends followed by an ~800ms pause
// keeps us comfortably below that even accounting for jitter/latency.
const BATCH_DELAY_MS = 800;
const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /429|rate.?limit/i.test(message);
}

/**
 * Thin wrapper around sendClientEmail that retries a couple of times, with
 * backoff, specifically for 429 (rate limit) responses from Resend — a
 * transient rate-limit hit shouldn't be counted as a permanent delivery
 * failure. Any other error is rethrown immediately.
 */
async function sendClientEmailWithRetry(
  opts: Parameters<typeof sendClientEmail>[0]
): ReturnType<typeof sendClientEmail> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await sendClientEmail(opts);
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === RATE_LIMIT_RETRIES) throw err;
      await sleep(RATE_LIMIT_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

async function sendInBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += SEND_CONCURRENCY) {
    await Promise.all(items.slice(i, i + SEND_CONCURRENCY).map(fn));
    if (i + SEND_CONCURRENCY < items.length) {
      await sleep(BATCH_DELAY_MS);
    }
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
  updated_at?: string | null;
}

/** True when a "sending" campaign's updated_at is old enough to be considered abandoned. */
function isStaleSending(campaign: CampaignRow): boolean {
  if (campaign.status !== "sending" || !campaign.updated_at) return false;
  return Date.now() - new Date(campaign.updated_at).getTime() > STUCK_SENDING_THRESHOLD_MS;
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
  if (!["draft", "scheduled"].includes(campaign.status) && !isStaleSending(campaign)) {
    return { ok: false, error: "Campaign has already been sent" };
  }
  if (!campaign.subject?.trim() || !campaign.body?.trim()) {
    return { ok: false, error: "Campaign needs a subject and body before sending" };
  }

  let query = db
    .from("clients")
    .select(`
      id, display_name, first_name, last_name, primary_email, phones,
      account_number, invoice_delivery, balance_outstanding_cents,
      billing_address, billing_city, billing_state, billing_zip,
      service_address, service_city, service_state, service_zip,
      turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
      linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew,
      referred_by, unsubscribe_token,
      sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name),
      referring_client:referred_by_client_id(display_name)
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("do_not_market", false)
    // A hard bounce is tracked separately from the marketing opt-out now (see
    // 20260919010000_client_email_bounce_suppression.sql). The Resend webhook
    // used to fold bounces into do_not_market, so this filter caught them for
    // free; it no longer does, and a campaign must never re-send to an address
    // that already bounced.
    .is("email_bounced_at", null)
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

  // Claim the campaign with a conditional update, not a plain one — two
  // near-simultaneous sends (a double-click, a duplicate tab, or a manual
  // "Send Now" racing the scheduled-send cron) both pass the draft/scheduled
  // status check above before either write lands; only conditioning this
  // UPDATE on status still being draft/scheduled (and checking it actually
  // matched a row) lets the second caller detect it lost the race and bail,
  // instead of both blasting the full audience and duplicating every send.
  // A "sending" campaign is also claimable, but only if it's stale (see
  // isStaleSending above) — this is the recovery path for a campaign whose
  // route died mid-send; a genuinely in-flight "sending" row (updated_at
  // recent) must NOT match, or a concurrent retry would double-send.
  const staleCutoffIso = new Date(Date.now() - STUCK_SENDING_THRESHOLD_MS).toISOString();
  const { data: claimed, error: claimErr } = await db
    .from("crm_campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaign.id)
    .or(`status.in.(draft,scheduled),and(status.eq.sending,updated_at.lt.${staleCutoffIso})`)
    .select("id");
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, error: "Campaign has already been sent" };
  }

  const { data: org } = await db
    .from("organizations")
    .select("name, address")
    .eq("id", orgId)
    .single();

  const orgName = org?.name ?? "Your Service Provider";
  const orgAddress = org?.address ?? null;
  // Hoisted out of the per-recipient loop: one campaign is one org.
  const orgTimeZone = await getOrgTimeZone(db, orgId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://landscapt.com";

  let delivered = 0;
  let failed = 0;

  interface Recipient {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    primary_email: string;
    phones: { phone: string; type: string }[] | null;
    account_number: string | null;
    invoice_delivery: string | null;
    balance_outstanding_cents: number | null;
    billing_address: string | null;
    billing_city: string | null;
    billing_state: string | null;
    billing_zip: string | null;
    service_address: string | null;
    service_city: string | null;
    service_state: string | null;
    service_zip: string | null;
    turf_sqft: number | null;
    gross_sqft: number | null;
    mulch_bed_sqft: number | null;
    yards_of_mulch: number | null;
    linear_ft_perimeter: number | null;
    linear_ft_edging: number | null;
    gate_lock_code: string | null;
    notes_to_crew: string | null;
    referred_by: string | null;
    unsubscribe_token: string;
    sales_rep: { first_name: string; last_name: string } | null;
    referring_client: { display_name: string } | null;
  }

  await sendInBatches(recipients as Recipient[], async (recipient) => {
    const client = {
      displayName: recipient.display_name,
      firstName: recipient.first_name,
      lastName: recipient.last_name,
      balanceOutstandingCents: recipient.balance_outstanding_cents,
      primaryEmail: recipient.primary_email,
      phones: recipient.phones,
      accountNumber: recipient.account_number,
      invoiceDelivery: recipient.invoice_delivery,
      billingAddress: recipient.billing_address,
      billingCity: recipient.billing_city,
      billingState: recipient.billing_state,
      billingZip: recipient.billing_zip,
      serviceAddress: recipient.service_address,
      serviceCity: recipient.service_city,
      serviceState: recipient.service_state,
      serviceZip: recipient.service_zip,
      turfSqft: recipient.turf_sqft,
      grossSqft: recipient.gross_sqft,
      mulchBedSqft: recipient.mulch_bed_sqft,
      yardsOfMulch: recipient.yards_of_mulch,
      linearFtPerimeter: recipient.linear_ft_perimeter,
      linearFtEdging: recipient.linear_ft_edging,
      gateLockCode: recipient.gate_lock_code,
      notesToCrew: recipient.notes_to_crew,
      salesRepName: recipient.sales_rep ? `${recipient.sales_rep.first_name} ${recipient.sales_rep.last_name}`.trim() : null,
      referringClientName: recipient.referring_client?.display_name ?? recipient.referred_by ?? null,
    };
    const org = {
      name: orgName,
      timeZone: orgTimeZone,
      addressPhone: orgAddress?.phone ?? null,
      addressStreet: orgAddress?.street ?? null,
      addressCity: orgAddress?.city ?? null,
      addressState: orgAddress?.state ?? null,
      addressZip: orgAddress?.zip ?? null,
    };
    // Two separate maps: the subject is plain text delivered verbatim to an
    // inbox, never rendered as HTML, so it must use raw (unescaped) values —
    // only the HTML body needs escaping. Using the escaped map for both would
    // leak literal "&amp;" etc. into the subject line (e.g. "Smith & Sons").
    const htmlMergeVars = buildClientMergeVars(client, org);
    const subjectMergeVars = buildClientMergeVars(client, org, { escape: false });
    const resolvedSubject = resolveMergeTags(campaign.subject!, subjectMergeVars);
    const resolvedBody = resolveMergeTags(campaign.body!, htmlMergeVars);
    const unsubscribeUrl = `${appUrl}/api/crm/unsubscribe/${recipient.unsubscribe_token}?campaign=${campaign.id}`;
    const html = resolvedBody + buildCanSpamFooter(orgName, orgAddress, unsubscribeUrl);

    try {
      const sent = await sendClientEmailWithRetry({ to: recipient.primary_email, subject: resolvedSubject, html });
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
        resend_message_id: sent.resendId,
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
