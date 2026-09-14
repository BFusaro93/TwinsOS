import { NextResponse } from "next/server";
import { adminClient } from "@/lib/api/auth";
import { hashToken } from "@/lib/api/oauth";

/**
 * RFC 7009 OAuth 2.0 Token Revocation. Per the RFC, always returns 200 even
 * for an unknown/already-revoked token -- returning a different status for
 * "not found" would let a caller use this endpoint to probe which tokens
 * are valid.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get("token")?.toString();
  if (!token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = adminClient();
  await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashToken(token)).is("revoked_at", null);

  return new NextResponse(null, { status: 200 });
}
