import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendCampaignEmails } from "@/lib/campaigns/send-campaign";

// A large campaign can take longer than the platform's default route
// timeout to send every recipient; extend the ceiling so more campaigns
// finish (and reach the "completed" status update) within one invocation.
// Does not eliminate the possibility of a mid-send timeout — see
// isStaleSending in send-campaign.ts for the recovery path when it happens.
export const maxDuration = 300;

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

  // Bulk-emailing every recipient is gated in the UI by campaign_send; the
  // server must enforce it too or any CRM user can POST here directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canSend } = await (supabase.rpc as any)("has_settings_permission", { p_key: "campaign_send" });
  if (!canSend) {
    return NextResponse.json({ error: "You don't have permission to send campaigns" }, { status: 403 });
  }

  const { id: campaignId } = await params;

  // The send runs as the service role, like the scheduled-campaigns cron: the campaign
  // guard trigger (campaign_edit) would otherwise reject the heartbeat and the final
  // sent/failed status writes for a role that holds campaign_send but not campaign_edit,
  // leaving the campaign stuck in "sending" after the emails went out. Permission is
  // checked above and every query below is scoped to the session's org.
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
  const { data: campaign } = await db
    .from("crm_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const result = await sendCampaignEmails(db, campaign, profile.org_id, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ totalRecipients: result.totalRecipients, delivered: result.delivered, failed: result.failed });
}
