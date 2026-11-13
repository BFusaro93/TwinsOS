import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { renderEstimatePDF } from "@/lib/estimate-pdf";
import { isEstimateAccepted } from "@/lib/estimates/deposit-due";

// Public route — no auth; the share token is the credential, checked exactly
// as the proposal GET checks it (including "accepted proposals never expire"). Renders the same PDF the staff "Download PDF"
// button, the portal, and the emailed attachment use, so the client can save
// a copy of what they're signing. Doesn't count as a proposal view.
// ?download=1 forces a save instead of the browser viewer.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shareToken } = await (supabase as any)
    .from("estimate_share_tokens")
    .select("estimate_id, org_id, expires_at, accepted_at")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle() as { data: { estimate_id: string; org_id: string; expires_at: string | null; accepted_at: string | null } | null };

  if (!shareToken) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  const linkExpired = !!shareToken.expires_at && new Date(shareToken.expires_at) < new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est } = await (supabase as any)
    .from("estimates")
    .select("estimate_number, stage, portal_accepted_at")
    .eq("id", shareToken.estimate_id)
    .eq("org_id", shareToken.org_id)
    .is("deleted_at", null)
    .maybeSingle() as { data: { estimate_number: string | number; stage: string | null; portal_accepted_at: string | null } | null };
  if (!est) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  // Same rule as the proposal page: an ACCEPTED proposal stays viewable for
  // good, so the client can still download the copy of what they signed after
  // the link's own expiry. Only an unaccepted one expires.
  const accepted = isEstimateAccepted({
    tokenAcceptedAt: shareToken.accepted_at,
    portalAcceptedAt: est.portal_accepted_at,
    stage: est.stage,
  });
  if (linkExpired && !accepted) {
    return NextResponse.json({ error: "This proposal link has expired" }, { status: 410 });
  }

  // renderEstimatePDF logs and returns null on a render failure.
  // The client's copy is the version they were sent, like the page itself.
  const buffer = await renderEstimatePDF(supabase, shareToken.estimate_id, shareToken.org_id, { published: true });
  if (!buffer) return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="estimate-${String(est.estimate_number).padStart(5, "0")}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
