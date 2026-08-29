import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { isKnownScope } from "@/lib/api/scopes";
import {
  generateOpaqueToken,
  hashToken,
  allowedScopeStringsForRole,
  AUTHORIZATION_CODE_PREFIX,
  AUTHORIZATION_CODE_TTL_MS,
} from "@/lib/api/oauth";
import { logger } from "@/lib/logger";

const log = logger.child("mcp-oauth-authorize");

/**
 * The "approve"/"deny" submit from the consent form rendered at
 * /oauth/authorize (see that page for the GET half of this flow). Under
 * /api/ (middleware treats every /api/ route as handling its own auth), so
 * the signed-in check below is this route's own responsibility, not
 * middleware's.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = form.get("client_id")?.toString();
  const redirectUri = form.get("redirect_uri")?.toString();
  const codeChallenge = form.get("code_challenge")?.toString();
  const codeChallengeMethod = form.get("code_challenge_method")?.toString() ?? "S256";
  const state = form.get("state")?.toString();
  const decision = form.get("decision")?.toString();
  const requestedScopes = form.getAll("scopes").map((s) => s.toString());

  if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = adminClient();
  const { data: client } = await db
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client || !((client.redirect_uris as string[]) ?? []).includes(redirectUri)) {
    // Can't trust an unregistered redirect_uri -- fail closed with a plain
    // response rather than redirecting anywhere.
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  const redirectWithParams = (extra: Record<string, string>) => {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    if (state !== undefined) url.searchParams.set("state", state);
    return NextResponse.redirect(url, { status: 303 });
  };

  if (decision !== "approve") {
    return redirectWithParams({ error: "access_denied" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "access_denied", error_description: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Never trust the submitted checkboxes alone -- the consent page (PR 3)
  // already hides write scopes from a non-admin's picker, but re-check here
  // too in case of a forged/replayed form post.
  const allowedForRole = allowedScopeStringsForRole(profile.role);
  const scopes = requestedScopes.filter((s) => isKnownScope(s) && allowedForRole.has(s));
  if (scopes.length === 0) {
    return redirectWithParams({ error: "invalid_scope", error_description: "No valid scope was selected" });
  }

  const code = generateOpaqueToken(AUTHORIZATION_CODE_PREFIX);
  const { error } = await db.from("oauth_authorization_codes").insert({
    code_hash: hashToken(code),
    client_id: clientId,
    user_id: user.id,
    org_id: profile.org_id,
    scopes,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS).toISOString(),
  });
  if (error) {
    log.error("failed to store authorization code", { err: error });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return redirectWithParams({ code });
}
