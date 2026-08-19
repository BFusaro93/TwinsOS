import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest } from "@/lib/integrations/zapier";

const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  description: z.string().optional(),
  priority: z.string().optional(),
  woType: z.string().optional(),
  dueDate: z.string().optional(),
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
      .maybeSingle();
    if (!asset || asset.org_id !== auth.orgId) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    assetName = asset.name;
  }

  const { data, error } = await db
    .from("work_orders")
    .insert({
      org_id: auth.orgId,
      title: body.title,
      asset_id: body.assetId ?? null,
      asset_name: assetName,
      description: body.description ?? null,
      priority: body.priority ?? "medium",
      wo_type: body.woType ?? null,
      due_date: body.dueDate ?? null,
      status: "open",
    })
    .select("id, work_order_number, title, status, priority, due_date, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
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
