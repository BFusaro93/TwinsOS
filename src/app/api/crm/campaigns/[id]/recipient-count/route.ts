import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCampaignRecipients } from "@/lib/campaigns/send-campaign";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

/**
 * GET /api/crm/campaigns/[id]/recipient-count — how many emails "Send Now"
 * would send for this campaign, resolved by the send's own recipient logic
 * (segment, Do Not Market, OK to Email, hard bounces, opt-outs on any account
 * sharing the address, one copy per address). The confirm dialog shows it, so
 * the number on the button is the number that goes out.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId: string = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  // Same gate as the send itself.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canSend } = await (supabase.rpc as any)("has_settings_permission", { p_key: "campaign_send" });
  if (!canSend) {
    return NextResponse.json({ error: "You don't have permission to send campaigns" }, { status: 403 });
  }

  const { id: campaignId } = await params;
  // The caller's own session: RLS keeps both the campaign and the client list in their org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;
  const { data: campaign } = await db
    .from("crm_campaigns")
    .select("id, target_segment, audience_client_ids")
    .eq("id", campaignId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const resolved = await resolveCampaignRecipients(db, campaign, orgId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 422 });
  return NextResponse.json({ count: resolved.recipients.length });
}
