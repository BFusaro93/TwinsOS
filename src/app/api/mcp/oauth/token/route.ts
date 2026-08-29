import { NextResponse } from "next/server";
import { adminClient } from "@/lib/api/auth";
import {
  generateOpaqueToken,
  hashToken,
  verifyPkce,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from "@/lib/api/oauth";
import { logger } from "@/lib/logger";

const log = logger.child("mcp-oauth-token");

type IssuedTokens = { accessToken: string; refreshToken: string; scopes: string[] };

/** Inserts a fresh access+refresh token pair, optionally linking the old
 * refresh token it replaces (rotation on the refresh_token grant below). */
async function issueTokenPair(
  db: ReturnType<typeof adminClient>,
  args: { clientId: string; userId: string; orgId: string; scopes: string[]; replacesRefreshTokenId?: string }
): Promise<IssuedTokens | null> {
  const accessToken = generateOpaqueToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateOpaqueToken(REFRESH_TOKEN_PREFIX);
  const now = Date.now();

  const { data: refreshRow, error: refreshErr } = await db
    .from("oauth_tokens")
    .insert({
      token_hash: hashToken(refreshToken),
      token_type: "refresh",
      client_id: args.clientId,
      user_id: args.userId,
      org_id: args.orgId,
      scopes: args.scopes,
      expires_at: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (refreshErr || !refreshRow) {
    log.error("failed to insert refresh token", { err: refreshErr });
    return null;
  }

  const { error: accessErr } = await db.from("oauth_tokens").insert({
    token_hash: hashToken(accessToken),
    token_type: "access",
    client_id: args.clientId,
    user_id: args.userId,
    org_id: args.orgId,
    scopes: args.scopes,
    expires_at: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
  });
  if (accessErr) {
    log.error("failed to insert access token", { err: accessErr });
    return null;
  }

  if (args.replacesRefreshTokenId) {
    await db
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString(), replaced_by: refreshRow.id })
      .eq("id", args.replacesRefreshTokenId);
  }

  return { accessToken, refreshToken, scopes: args.scopes };
}

function tokenResponse(tokens: IssuedTokens) {
  return NextResponse.json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: tokens.scopes.join(" "),
    refresh_token: tokens.refreshToken,
  });
}

/**
 * RFC 6749 token endpoint -- exchanges an authorization code (with its PKCE
 * verifier, per RFC 7636) or a refresh token for an access token. Public
 * client only: no client_secret is checked, since Claude's connector
 * authenticates via PKCE at the authorization step instead (see PR 3).
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = form.get("grant_type")?.toString();
  const db = adminClient();

  if (grantType === "authorization_code") {
    const code = form.get("code")?.toString();
    const redirectUri = form.get("redirect_uri")?.toString();
    const clientId = form.get("client_id")?.toString();
    const codeVerifier = form.get("code_verifier")?.toString();

    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { data: authCode } = await db
      .from("oauth_authorization_codes")
      .select("*")
      .eq("code_hash", hashToken(code))
      .maybeSingle();

    if (
      !authCode ||
      authCode.used_at ||
      authCode.client_id !== clientId ||
      authCode.redirect_uri !== redirectUri ||
      new Date(authCode.expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    if (!verifyPkce(codeVerifier, authCode.code_challenge)) {
      return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
    }

    // Mark used immediately so a replayed code (e.g. a retried request)
    // can't redeem a second token pair from it.
    await db.from("oauth_authorization_codes").update({ used_at: new Date().toISOString() }).eq("id", authCode.id);

    const tokens = await issueTokenPair(db, {
      clientId,
      userId: authCode.user_id,
      orgId: authCode.org_id,
      scopes: authCode.scopes ?? [],
    });
    if (!tokens) return NextResponse.json({ error: "server_error" }, { status: 500 });
    return tokenResponse(tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token")?.toString();
    const clientId = form.get("client_id")?.toString();
    if (!refreshToken || !clientId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { data: existing } = await db
      .from("oauth_tokens")
      .select("*")
      .eq("token_hash", hashToken(refreshToken))
      .eq("token_type", "refresh")
      .maybeSingle();

    if (
      !existing ||
      existing.revoked_at ||
      existing.client_id !== clientId ||
      new Date(existing.expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const tokens = await issueTokenPair(db, {
      clientId,
      userId: existing.user_id,
      orgId: existing.org_id,
      scopes: existing.scopes ?? [],
      replacesRefreshTokenId: existing.id,
    });
    if (!tokens) return NextResponse.json({ error: "server_error" }, { status: 500 });
    return tokenResponse(tokens);
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
