import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { INVOICE_SELECT, shapeInvoice } from "./shape";

/**
 * GET /api/v1/invoices — list the org's invoices. Requires scope
 * "invoices:read". Read-only: invoicing here goes through payment-method
 * and tax handling (including per-org Stripe Connect) that a direct-create
 * endpoint would bypass.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "invoices:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("crm_invoices")
    .select(INVOICE_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeInvoice), limit, offset });
}
