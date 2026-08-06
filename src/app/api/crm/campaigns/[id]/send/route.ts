import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendCampaignEmails } from "@/lib/campaigns/send-campaign";

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
  const db = supabase as any;
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
