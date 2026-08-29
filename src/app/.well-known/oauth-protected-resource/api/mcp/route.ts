import { NextResponse } from "next/server";
import type { OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getIssuer, ALL_SCOPE_STRINGS } from "@/lib/api/oauth";

/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata for /api/mcp specifically
 * (hence the /api/mcp path suffix after the well-known segment). This is the
 * first thing an OAuth-aware MCP client fetches on a 401 from /api/mcp --
 * it points back at our own authorization server metadata, since this app
 * is both the resource server and the authorization server.
 */
export async function GET() {
  const issuer = getIssuer();

  const metadata: OAuthProtectedResourceMetadata = {
    resource: `${issuer}/api/mcp`,
    authorization_servers: [issuer],
    scopes_supported: ALL_SCOPE_STRINGS,
    bearer_methods_supported: ["header"],
  };

  return NextResponse.json(metadata);
}
