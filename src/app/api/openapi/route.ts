import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/openapi";

/** GET /api/openapi — the public API's OpenAPI 3.1 spec. No auth required; the spec itself is not tenant data. */
export async function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
