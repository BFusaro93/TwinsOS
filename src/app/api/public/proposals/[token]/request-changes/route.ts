import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { submitEstimateChangeRequest } from "@/lib/estimate-change-requests";

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json() as { requesterName: string; message: string };

  if (!body.requesterName?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: "Name and message are required" }, { status: 400 });
  }

  const supabase = serviceClient();

  const { data: shareToken, error: tokenErr } = await supabase
    .from("estimate_share_tokens")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .single();

  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "Proposal link has expired" }, { status: 410 });
  }

  const { data: est } = await supabase
    .from("estimates")
    .select("id, org_id, client_id, estimate_number, stage")
    .eq("id", shareToken.estimate_id)
    .single();

  if (!est) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  // Same guard as accept/route.ts: the token being unrevoked only says the
  // link is still valid — it says nothing about whether staff already moved
  // the estimate on (accepted, declined, or converted/invoiced) since the
  // link was sent. Only a "sent" estimate is still open to change requests.
  if (est.stage !== "sent") {
    return NextResponse.json({ error: "This proposal is no longer actionable" }, { status: 409 });
  }

  await submitEstimateChangeRequest(supabase, {
    orgId: est.org_id,
    estimateId: est.id,
    clientId: est.client_id,
    estimateNumber: est.estimate_number,
    message: body.message.trim(),
    requesterName: body.requesterName.trim(),
  });

  return NextResponse.json({ ok: true });
}
