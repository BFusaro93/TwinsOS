import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";

const createRequisitionSchema = z.object({
  title: z.string().min(1),
  vendorId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/integrations/zapier/actions/requisitions — Zapier action
 * ("Create Requisition"). vendorId/workOrderId, if given, must belong to
 * the authenticated org. requisition_number is generated the same way
 * useCreateRequisition does client-side (src/lib/hooks/use-requisitions.ts).
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

  const requisitionNumber = `REQ-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

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
    .select("id, requisition_number, title, status, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    requisitionNumber: data.requisition_number,
    title: data.title,
    status: data.status,
    createdAt: data.created_at,
  });
}
