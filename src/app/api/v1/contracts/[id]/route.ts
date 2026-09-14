import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { CONTRACT_SELECT, shapeContract } from "../shape";

/** GET /api/v1/contracts/[id] — fetch one contract. Requires scope "contracts:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "contracts:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("crm_contracts")
    .select(CONTRACT_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/contracts/[id]", error);
  if (!data) return jsonError("Contract not found", 404);
  return NextResponse.json(shapeContract(data));
}
