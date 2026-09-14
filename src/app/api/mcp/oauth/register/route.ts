import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { OAuthClientMetadataSchema, type OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { adminClient } from "@/lib/api/auth";
import { logger } from "@/lib/logger";

const log = logger.child("mcp-oauth-register");

/**
 * RFC 7591 OAuth 2.0 Dynamic Client Registration. Public endpoint (no auth)
 * -- an MCP client (e.g. Claude.ai's connector) self-registers the first
 * time it connects, so there's no manual "create an OAuth app" step for the
 * org admin to do. Public clients only for now: no client_secret is issued,
 * since Claude's connector authenticates via PKCE instead.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = OAuthClientMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: parsed.error.message },
      { status: 400 }
    );
  }
  const metadata = parsed.data;

  const clientId = randomUUID();
  const db = adminClient();
  const { error } = await db.from("oauth_clients").insert({
    client_id: clientId,
    client_name: metadata.client_name ?? "Unnamed MCP client",
    redirect_uris: metadata.redirect_uris,
  });

  if (error) {
    log.error("client registration failed", { err: error });
    return NextResponse.json({ error: "server_error", error_description: "Failed to register client" }, { status: 500 });
  }

  const response: OAuthClientInformationFull = {
    ...metadata,
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    grant_types: metadata.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: metadata.response_types ?? ["code"],
  };

  return NextResponse.json(response, { status: 201 });
}
