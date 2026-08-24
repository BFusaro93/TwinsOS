import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { INVOICE_SELECT, INVOICE_LINE_ITEM_SELECT, shapeInvoice, shapeInvoiceLineItem } from "../shape";

/** GET /api/v1/invoices/[id] — fetch one invoice with its line items. Requires scope "invoices:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "invoices:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("crm_invoices")
    .select(INVOICE_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Invoice not found", 404);

  const { data: lineItems, error: lineItemsError } = await db
    .from("crm_invoice_line_items")
    .select(INVOICE_LINE_ITEM_SELECT)
    .eq("org_id", auth.orgId)
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });

  if (lineItemsError) return jsonError(lineItemsError.message, 500);

  return NextResponse.json({
    ...shapeInvoice(data),
    lineItems: (lineItems ?? []).map(shapeInvoiceLineItem),
  });
}
