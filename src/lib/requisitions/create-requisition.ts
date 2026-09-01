import { REQUISITION_SELECT } from "@/app/api/v1/requisitions/shape";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export interface CreateRequisitionLineItemInput {
  productItemId: string;
  quantity: number;
  unitCostCents?: number;
  projectId?: string | null;
  notes?: string | null;
}

export interface CreateRequisitionInput {
  orgId: string;
  title: string;
  vendorId?: string | null;
  vendorName?: string | null;
  workOrderId?: string | null;
  crmJobId?: string | null;
  requestedById?: string | null;
  requestedByName?: string;
  notes?: string | null;
  taxRatePercent?: number;
  shippingCostCents?: number;
  lineItems: CreateRequisitionLineItemInput[];
}

interface ProductRow {
  name: string;
  part_number?: string | null;
  unit_cost: number;
}

/**
 * Core "insert a draft requisition + its line items" logic, shared by the
 * public v1 API (src/app/api/v1/requisitions/route.ts) and the crew-app
 * field materials-request route
 * (src/app/api/crm/crew/visits/[visitId]/requisitions/route.ts) — see
 * CLAUDE.md: every line item must reference a product_items catalog entry,
 * never free text.
 *
 * Callers own their own auth/scope checks and must validate, BEFORE calling
 * this, that every `lineItems[].productItemId` belongs to `input.orgId` and
 * is an allowed category for that caller. `products` must already contain a
 * row for every line item's productItemId, keyed by that id — this function
 * makes no authorization assumptions of its own and throws if a product is
 * missing from the map, rather than silently querying for it.
 *
 * `db` must be a service-role (admin) client (see src/lib/api/auth.ts
 * adminClient()). Both callers need one regardless of caller identity:
 * requisitions/requisition_line_items INSERT is blocked for crew-role
 * sessions by RLS (org_members_requisitions excludes role='crew' — see
 * supabase/migrations/20260824114014_restrict_crew_role_from_financial_
 * tables.sql), and the public v1 API has no user session to write with at
 * all (it authenticates via API key, not Supabase auth).
 *
 * Always creates in "draft" status, same as both existing callers — moving
 * a requisition into the approval pipeline goes through
 * submitEntityForApproval() (src/lib/hooks/use-approval-requests.ts), which
 * runs as the submitting user's own session (not this admin client) so the
 * resulting approval_requests rows and notifications attribute correctly.
 * Neither caller here submits for approval automatically yet — a crew
 * member's field request lands in the office's Requisitions list as a
 * draft, same as one created via the public API, and needs an office/admin
 * user to review and submit it from the web app.
 */
export async function createRequisitionRecord(
  db: AdminClient,
  input: CreateRequisitionInput,
  products: Map<string, ProductRow>
): Promise<{ requisition: Record<string, unknown> | null; error: string | null }> {
  const lineItemRows = input.lineItems.map((li) => {
    const product = products.get(li.productItemId);
    if (!product) {
      throw new Error(`createRequisitionRecord: missing product row for line item ${li.productItemId}`);
    }
    const unitCost = li.unitCostCents ?? product.unit_cost;
    return {
      org_id: input.orgId,
      product_item_id: li.productItemId,
      product_item_name: product.name,
      part_number: product.part_number ?? "",
      quantity: li.quantity,
      unit_cost: unitCost,
      total_cost: unitCost * li.quantity,
      project_id: li.projectId ?? null,
      notes: li.notes ?? null,
    };
  });

  const subtotal = lineItemRows.reduce((sum, li) => sum + li.total_cost, 0);
  const taxRatePercent = input.taxRatePercent ?? 0;
  const salesTax = Math.round(subtotal * (taxRatePercent / 100));
  const shippingCost = input.shippingCostCents ?? 0;
  const grandTotal = subtotal + salesTax + shippingCost;
  // Atomic per-org/year counter, not Date.now() — two requests in the same
  // millisecond (concurrent submits, two automation runs) previously
  // produced the same number with nothing to catch it.
  const { data: requisitionNumber, error: numberErr } = await db.rpc("next_requisition_number", {
    p_org_id_override: input.orgId,
  });
  if (numberErr || !requisitionNumber) {
    return { requisition: null, error: numberErr?.message ?? "Failed to generate requisition number" };
  }

  const { data: requisition, error } = await db
    .from("requisitions")
    .insert({
      org_id: input.orgId,
      title: input.title,
      requisition_number: requisitionNumber,
      vendor_id: input.vendorId ?? null,
      vendor_name: input.vendorName ?? null,
      work_order_id: input.workOrderId ?? null,
      crm_job_id: input.crmJobId ?? null,
      requested_by_id: input.requestedById ?? null,
      requested_by_name: input.requestedByName ?? "",
      notes: input.notes ?? null,
      status: "draft",
      subtotal,
      tax_rate_percent: taxRatePercent,
      sales_tax: salesTax,
      shipping_cost: shippingCost,
      grand_total: grandTotal,
    })
    .select(REQUISITION_SELECT)
    .single();

  if (error || !requisition) return { requisition: null, error: error?.message ?? "create failed" };

  const { error: lineItemsError } = await db
    .from("requisition_line_items")
    .insert(lineItemRows.map((li) => ({ ...li, requisition_id: requisition.id })));

  if (lineItemsError) return { requisition: null, error: lineItemsError.message };

  return { requisition, error: null };
}
