import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { createRequisitionRecord } from "@/lib/requisitions/create-requisition";
import { REQUISITION_SELECT, shapeRequisition } from "@/app/api/v1/requisitions/shape";

const lineItemSchema = z.object({
  productItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

const createRequisitionSchema = z.object({
  title: z.string().min(1),
  vendorId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  notes: z.string().optional(),
  // Optional because the Zapier "Create Requisition" trigger predates line
  // items being collected — most configured Zaps only pass header fields.
  // When present, this goes through createRequisitionRecord just like the
  // public v1 API and the app itself, so it gets real catalog validation and
  // subtotal/tax/grand_total computation. See the header-only fallback below
  // for what happens when it's omitted.
  lineItems: z.array(lineItemSchema).optional(),
});

/**
 * POST /api/integrations/zapier/actions/requisitions — Zapier action
 * ("Create Requisition"). vendorId/workOrderId, if given, must belong to
 * the authenticated org.
 *
 * requisition_number is always generated via the atomic next_requisition_number
 * RPC (same one createRequisitionRecord and useCreateRequisition use) — never
 * derived from Date.now(), which could collide with another concurrent
 * create (another Zap run, or a requisition created from the app in the same
 * millisecond).
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const parsed = createRequisitionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  let vendorName: string | null = null;
  if (body.vendorId) {
    const { data: vendor } = await db
      .from("vendors")
      .select("org_id, name")
      .eq("id", body.vendorId)
      .maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }
    vendorName = vendor.name;
  }
  if (body.workOrderId) {
    const { data: wo } = await db
      .from("work_orders")
      .select("org_id")
      .eq("id", body.workOrderId)
      .maybeSingle();
    if (!wo || wo.org_id !== auth.orgId) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }
  }

  if (body.lineItems && body.lineItems.length > 0) {
    // Same shape as src/app/api/v1/requisitions/route.ts: every productItemId
    // must resolve to a catalog entry belonging to this org before it's
    // trusted (CLAUDE.md — "Do not allow free-text item descriptions on
    // POs," which applies equally to Requisitions).
    const productIds = [...new Set(body.lineItems.map((li) => li.productItemId))];
    const { data: products } = await db
      .from("product_items")
      .select("id, org_id, name, part_number, unit_cost")
      .in("id", productIds);
    const productMap = new Map((products ?? []).map((p) => [p.id as string, p]));
    for (const id of productIds) {
      const product = productMap.get(id);
      if (!product || product.org_id !== auth.orgId) {
        return NextResponse.json({ error: `Product item ${id} not found` }, { status: 404 });
      }
    }

    const { requisition, error: createError } = await createRequisitionRecord(
      db,
      {
        orgId: auth.orgId,
        title: body.title,
        vendorId: body.vendorId ?? null,
        vendorName,
        workOrderId: body.workOrderId ?? null,
        requestedByName: "Zapier",
        notes: body.notes ?? null,
        lineItems: body.lineItems.map((li) => ({
          productItemId: li.productItemId,
          quantity: li.quantity,
          unitCostCents: li.unitCostCents,
          notes: li.notes,
        })),
      },
      productMap as unknown as Map<string, { name: string; part_number?: string | null; unit_cost: number }>
    );

    if (createError || !requisition) {
      return NextResponse.json({ error: createError ?? "create failed" }, { status: 500 });
    }

    const shaped = shapeRequisition(requisition);
    return NextResponse.json({
      id: shaped.id,
      requisitionNumber: shaped.requisitionNumber,
      title: shaped.title,
      status: shaped.status,
      createdAt: shaped.createdAt,
    });
  }

  // No line items were supplied — most Zaps configured against this action
  // predate line-item support and only ever passed header fields. Rather
  // than reject those Zaps outright, this still creates a draft requisition
  // (so the trigger keeps working end-to-end for anyone piping it into a
  // requisition-created automation), but it deliberately CANNOT go through
  // createRequisitionRecord: that function computes subtotal/tax/grand_total
  // from lineItems and requires every line to reference a product_items
  // catalog entry — there is nothing to build those from here. The resulting
  // requisition has zero line items and $0 totals; an office/admin user must
  // add real line items from the app before submitting it for approval, same
  // as a crew-created draft requisition with nothing in it yet. What's fixed
  // here is only the unsafe requisition_number generation.
  const { data: requisitionNumber, error: numberErr } = await db.rpc("next_requisition_number", {
    p_org_id_override: auth.orgId,
  });
  if (numberErr || !requisitionNumber) {
    return NextResponse.json(
      { error: numberErr?.message ?? "Failed to generate requisition number" },
      { status: 500 }
    );
  }

  const { data, error } = await db
    .from("requisitions")
    .insert({
      org_id: auth.orgId,
      title: body.title,
      requisition_number: requisitionNumber,
      vendor_id: body.vendorId ?? null,
      vendor_name: vendorName,
      work_order_id: body.workOrderId ?? null,
      notes: body.notes ?? null,
      requested_by_name: "Zapier",
      status: "draft",
    })
    .select(REQUISITION_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
  }

  const shaped = shapeRequisition(data);
  return NextResponse.json({
    id: shaped.id,
    requisitionNumber: shaped.requisitionNumber,
    title: shaped.title,
    status: shaped.status,
    createdAt: shaped.createdAt,
  });
}
