import { NextResponse } from "next/server";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getIssuer, ALL_SCOPE_STRINGS } from "@/lib/api/oauth";

/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata -- the MCP client (e.g.
 * Claude.ai's connector) fetches this to discover how to talk to our OAuth
 * flow (src/app/api/mcp/oauth/*) after finding our issuer via the resource
 * metadata at /.well-known/oauth-protected-resource/api/mcp.
 */
export async function GET() {
  const issuer = getIssuer();

  const metadata: OAuthMetadata = {
    issuer,
    authorization_endpoint: `${issuer}/api/mcp/oauth/authorize`,
    token_endpoint: `${issuer}/api/mcp/oauth/token`,
    registration_endpoint: `${issuer}/api/mcp/oauth/register`,
    revocation_endpoint: `${issuer}/api/mcp/oauth/revoke`,
    scopes_supported: ALL_SCOPE_STRINGS,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };

  return NextResponse.json(metadata);
}
