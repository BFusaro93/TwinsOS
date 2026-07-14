import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { submitEstimateChangeRequest } from "@/lib/estimate-change-requests";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, signatureName, message } = await req.json();

  if (!["accept", "decline", "request_changes"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "accept" && !signatureName?.trim()) {
    return NextResponse.json({ error: "Signature name is required to accept" }, { status: 400 });
  }
  if (action === "request_changes" && !message?.trim()) {
    return NextResponse.json({ error: "Please describe the changes you'd like" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify the estimate belongs to this client and is in an actionable state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estimate } = await (supabase as any)
    .from("estimates")
    .select("id, stage, org_id, client_id, estimate_number")
    .eq("id", id)
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single() as { data: { id: string; stage: string; org_id: string; client_id: string; estimate_number: number } | null };

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  if (estimate.stage !== "sent") {
    return NextResponse.json({ error: "Estimate is no longer actionable" }, { status: 409 });
  }

  if (action === "request_changes") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: client } = await (supabase as any)
      .from("clients")
      .select("display_name")
      .eq("id", estimate.client_id)
      .single() as { data: { display_name: string } | null };

    await submitEstimateChangeRequest(supabase, {
      orgId: estimate.org_id,
      estimateId: estimate.id,
      clientId: estimate.client_id,
      estimateNumber: estimate.estimate_number,
      message: message.trim(),
      requesterName: client?.display_name ?? ctx.email,
      requesterEmail: ctx.email,
    });
    return NextResponse.json({ success: true, status: "sent" });
  }

  const now = new Date().toISOString();
  const patch =
    action === "accept"
      ? {
          stage: "accepted",
          portal_accepted_at: now,
          portal_signature_name: signatureName.trim(),
          portal_user_id: ctx.userId,
        }
      : {
          stage: "declined",
          portal_declined_at: now,
          portal_user_id: ctx.userId,
        };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("estimates")
    .update({ ...patch, updated_at: now })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) {
    console.error("[portal/estimates/action] Failed to update estimate:", error);
    return NextResponse.json({ error: "Failed to update estimate" }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: patch.stage });
}
