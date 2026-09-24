import { NextRequest, NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { renderInvoicePDF } from "@/lib/invoices/pdf-data";
import { logger } from "@/lib/logger";

const log = logger.child("portal/billing/pdf");

// The real invoice PDF — the same renderer (and org template) the staff
// "Download PDF" button and the emailed attachment use — for the signed-in
// portal client. ?download=1 forces a save instead of the browser viewer.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Service client bypasses RLS, so ownership is checked here: the invoice
  // must belong to this portal client in the active org, and not be a draft.
  const { data: owned } = await supabase
    .from("crm_invoices")
    .select("id")
    .eq("id", id)
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .neq("status", "draft")
    .is("deleted_at", null)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  try {
    const result = await renderInvoicePDF(supabase, id, ctx.orgId, null);
    if (!result) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
    return new NextResponse(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="invoice-${result.invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    log.error("PDF render failed", { invoiceId: id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
