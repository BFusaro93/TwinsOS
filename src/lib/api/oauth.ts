import { randomBytes, createHash } from "crypto";
import { API_SCOPE_RESOURCES, scopeString, type ApiScopeResource, type ApiScopeTier } from "@/lib/api/scopes";

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

/** Same sha256-hex approach as auth.ts's hashApiKey, named for this file's
 * own tokens (authorization codes, access/refresh tokens) so oauth.ts
 * doesn't need to import an api-key-specific helper for an unrelated use. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Validates a PKCE code_verifier against the code_challenge stored at
 * authorization time (RFC 7636, S256 method only -- the only method this
 * server advertises in its authorization server metadata). */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === codeChallenge;
}

/** The scope tiers a given profile role is allowed to grant itself via the
 * OAuth consent screen. Only admins can hand out a write scope -- every
 * other role (manager, technician, purchaser, viewer) is capped at
 * read-only, same restriction whether they're picking checkboxes on the
 * consent screen (see oauthResourcesForRole below) or the actual grant is
 * enforced server-side (POST /api/mcp/oauth/authorize). */
export function allowedTiersForRole(role: string): ApiScopeTier[] {
  return role === "admin" ? ["read", "write:safe"] : ["read"];
}

/** The scope catalog trimmed to what a role's consent screen should even
 * show -- a resource with no tiers left after the cap (none exist today,
 * since every resource offers at least read) is naturally excluded. */
export function oauthResourcesForRole(role: string): ApiScopeResource[] {
  const allowedTiers = allowedTiersForRole(role);
  return API_SCOPE_RESOURCES.map((resource) => ({
    ...resource,
    tiers: resource.tiers.filter((tier) => allowedTiers.includes(tier)),
  })).filter((resource) => resource.tiers.length > 0);
}

/** Scope strings a role is allowed to grant, for server-side enforcement of
 * the same cap oauthResourcesForRole applies to the consent screen's
 * checkboxes -- never trust the submitted form alone. */
export function allowedScopeStringsForRole(role: string): Set<string> {
  return new Set(
    oauthResourcesForRole(role).flatMap((resource) => resource.tiers.map((tier) => scopeString(resource.key, tier)))
  );
}
