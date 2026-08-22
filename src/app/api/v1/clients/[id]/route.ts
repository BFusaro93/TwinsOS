import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { CLIENT_SELECT, shapeClient } from "../shape";

const updateClientSchema = z.object({
  displayName: z.string().min(1).optional(),
  accountType: z.enum(["residential", "commercial"]).optional(),
  status: z.enum(["active", "inactive", "lead", "cancelled"]).optional(),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  source: z.string().optional(),
});

/** GET /api/v1/clients/[id] — fetch one client. Requires scope "clients:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Client not found", 404);
  return NextResponse.json(shapeClient(data));
}

/** PATCH /api/v1/clients/[id] — updates a client. Requires scope "clients:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateClientSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  const { data, error } = await db
    .from("clients")
    .update({
      ...(body.displayName !== undefined && { display_name: body.displayName }),
      ...(body.accountType !== undefined && { account_type: body.accountType }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.primaryPhone !== undefined && { primary_phone: body.primaryPhone }),
      ...(body.primaryEmail !== undefined && { primary_email: body.primaryEmail }),
      ...(body.billingAddress !== undefined && { billing_address: body.billingAddress }),
      ...(body.billingCity !== undefined && { billing_city: body.billingCity }),
      ...(body.billingState !== undefined && { billing_state: body.billingState }),
      ...(body.billingZip !== undefined && { billing_zip: body.billingZip }),
      ...(body.source !== undefined && { source: body.source }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(CLIENT_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Client not found", 404);
  return NextResponse.json(shapeClient(data));
}
