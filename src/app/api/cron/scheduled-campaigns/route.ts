import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { sendCampaignEmails } from "@/lib/campaigns/send-campaign";

/**
 * GET /api/cron/scheduled-campaigns — called hourly by Vercel Cron.
 *
 * A campaign's "Schedule Send" datetime was captured and displayed but
 * nothing ever acted on it — the only way a campaign was ever sent was the
 * manual "Send Now" button. This finds every email campaign whose
 * scheduled_at has passed and is status="scheduled" (not yet sent) and
 * sends it via the same sendCampaignEmails() the interactive route uses.
 *
 * Deliberately excludes status="draft" even if scheduled_at is set and in
 * the past: picking a send date on the create/edit form doesn't commit to
 * sending it — only the explicit "Mark Scheduled" action does (status ->
 * "scheduled"). A campaign left in draft with a stale scheduled_at while
 * someone is still editing its subject/body must never auto-send.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}. Reject anything else.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: dueCampaigns, error: fetchErr } = await db
    .from("crm_campaigns")
    .select("*")
    .eq("type", "email")
    .eq("status", "scheduled")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", new Date().toISOString())
    .is("deleted_at", null);

  if (fetchErr) {
    console.error("[scheduled-campaigns] fetch error:", fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({ sent: 0, message: "No campaigns due." });
  }

  const results: { campaignId: string; status: "sent" | "skipped"; reason?: string }[] = [];

  for (const campaign of dueCampaigns) {
    const result = await sendCampaignEmails(db, campaign, campaign.org_id, null);
    if (result.ok) {
      results.push({ campaignId: campaign.id, status: "sent" });
    } else {
      console.error(`[scheduled-campaigns] campaign ${campaign.id} failed:`, result.error);
      results.push({ campaignId: campaign.id, status: "skipped", reason: result.error });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.info(`[scheduled-campaigns] ${new Date().toISOString()}: ${sent} sent, ${skipped} skipped`);

  return NextResponse.json({ sent, skipped, results });
}
