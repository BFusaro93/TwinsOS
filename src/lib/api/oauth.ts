import { randomBytes } from "crypto";
import { API_SCOPE_RESOURCES, scopeString } from "@/lib/api/scopes";

/**
 * Shared constants/helpers for the MCP server's OAuth 2.1 + PKCE flow
 * (src/app/.well-known/oauth-*, src/app/api/mcp/oauth/*). This is additive
 * to, not a replacement for, the api_keys bearer-token path in
 * src/lib/api/auth.ts -- see that file's lookupApiKey() for where the two
 * converge into a single { orgId, scopes } result.
 */

/** Canonical base URL for this app, used as the OAuth issuer and in every
 * absolute endpoint URL returned from the metadata/registration routes. */
export function getIssuer(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
}

/** Every resource:tier scope string this server can issue, for the
 * authorization server metadata's scopes_supported and as the source list
 * for the consent screen's scope picker (PR 3). */
export const ALL_SCOPE_STRINGS: string[] = API_SCOPE_RESOURCES.flatMap((resource) =>
  resource.tiers.map((tier) => scopeString(resource.key, tier))
);

/** A short-lived (10 min), URL-safe random authorization code or opaque
 * access/refresh token. Same shape for all three -- only the DB row (and,
 * for tokens, the tos_-style prefix below) distinguishes their purpose. */
export function generateOpaqueToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export const AUTHORIZATION_CODE_PREFIX = "mcpac_";
export const ACCESS_TOKEN_PREFIX = "mcpat_";
export const REFRESH_TOKEN_PREFIX = "mcprt_";

export const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
