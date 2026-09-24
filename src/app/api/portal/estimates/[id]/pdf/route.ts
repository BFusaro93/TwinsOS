import { NextRequest, NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { renderEstimatePDF } from "@/lib/estimate-pdf";

// The real estimate PDF — the same renderer the staff "Download PDF" button
// and the emailed attachment use — for the signed-in portal client.
// ?download=1 forces a save instead of the browser viewer.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Service client bypasses RLS, so ownership is checked here: the estimate
  // must belong to this portal client in the active org, and already sent
  // (not a draft or an unsent quote).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned } = await (supabase as any)
    .from("estimates")
    .select("id, estimate_number")
    .eq("id", id)
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .not("stage", "in", "(draft,quote)")
    .is("deleted_at", null)
    .maybeSingle() as { data: { id: string; estimate_number: string | number } | null };
  if (!owned) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  // renderEstimatePDF logs and returns null on a render failure.
  const buffer = await renderEstimatePDF(supabase, id, ctx.orgId);
  if (!buffer) return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="estimate-${owned.estimate_number}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
