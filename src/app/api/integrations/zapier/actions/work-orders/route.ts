import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";

// Zapier sends "" for a field the Zap left unmapped; that means "not provided".
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  description: z.string().optional(),
  // work_orders has CHECK constraints on priority and wo_type and `date` on
  // due_date: an unrecognised value ("High", "Urgent", "10/31/2026") used to
  // get through here and fail the insert as an opaque 500 "create failed".
  // Case is normalised (a Zap field often sends "High"); anything else is a 400
  // that says what is wrong.
  priority: blankToUndefined(
    z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .pipe(z.enum(["low", "medium", "high", "critical"], { message: "priority must be low, medium, high or critical" }))
  ),
  woType: blankToUndefined(
    z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .pipe(z.enum(["reactive", "preventive"], { message: "woType must be reactive or preventive" }))
  ),
  dueDate: blankToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD")),
});

/**
 * POST /api/integrations/zapier/actions/work-orders — Zapier action
 * ("Create Work Order"). assetId, if given, must belong to the
 * authenticated org — checked explicitly, same guard as every other action.
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

  const parsed = createWorkOrderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  let assetName: string | null = null;
  if (body.assetId) {
    const { data: asset } = await db
      .from("assets")
      .select("org_id, name")
      .eq("id", body.assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!asset || asset.org_id !== auth.orgId) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    assetName = asset.name;
  }

  // work_order_number is NOT NULL with no default — allocate it from the
  // atomic per-org/year counter, same as /api/v1/work-orders.
  const { data: workOrderNumber, error: woNumErr } = await db.rpc("next_work_order_number", {
    p_org_id_override: auth.orgId,
  });
  if (woNumErr || !workOrderNumber) {
    return NextResponse.json({ error: "Could not allocate a work order number" }, { status: 500 });
  }

  const { data, error } = await db
    .from("work_orders")
    .insert({
      org_id: auth.orgId,
      work_order_number: workOrderNumber,
      title: body.title,
      asset_id: body.assetId ?? null,
      asset_name: assetName,
      description: body.description ?? null,
      priority: body.priority ?? "medium",
      wo_type: body.woType ?? null,
      linked_entity_type: body.assetId ? "asset" : null,
      due_date: body.dueDate ?? null,
      status: "open",
    })
    .select("id, work_order_number, title, status, priority, due_date, created_at")
    .single();

  if (error || !data) {
    // Don't hand raw database errors (constraint/column names) to the caller.
    console.error("[zapier action] create failed:", error?.message);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    workOrderNumber: data.work_order_number,
    title: data.title,
    status: data.status,
    priority: data.priority,
    dueDate: data.due_date,
    createdAt: data.created_at,
  });
}
