import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";

/**
 * GET /api/settings/oauth-connections -- lists this org's active OAuth
 * connections (Settings > Public API Keys > Connected Apps), one row per
 * distinct (client, connecting user) pair. A "connection" is tracked by its
 * refresh token, not its access token -- access tokens churn hourly
 * (src/lib/api/oauth.ts's ACCESS_TOKEN_TTL_MS) so they're a poor signal of
 * whether the connection itself is still active, while the refresh token
 * lives for the life of the connection (90 days, or until revoked).
 *
 * Uses the service-role client for the actual query (like api-keys' route)
 * because oauth_clients has no end-user RLS policy (service-role only, see
 * its migration) -- a join through it would silently come back null for
 * every row under the caller's own RLS-scoped client.
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const db = adminClient();
  const { data: refreshRows, error } = await db
    .from("oauth_tokens")
    .select("id, client_id, user_id, scopes, last_used_at, created_at, oauth_clients(client_name), profiles(name)")
    .eq("org_id", profile.org_id)
    .eq("token_type", "refresh")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A connection's own refresh-token row only gets last_used_at touched when
  // it's actually redeemed for a new pair (rare -- access tokens last an
  // hour, so most activity never refreshes). Every real tool call instead
  // updates the access token's own row, so pull the most recent last_used_at
  // across this connection's whole token history (every access token ever
  // issued for the same client_id/user_id) to get an accurate "last used".
  const { data: allTokens } = await db
    .from("oauth_tokens")
    .select("client_id, user_id, last_used_at")
    .eq("org_id", profile.org_id)
    .not("last_used_at", "is", null);

  const lastUsedByConnection = new Map<string, string>();
  for (const t of allTokens ?? []) {
    const key = `${t.client_id}:${t.user_id}`;
    const existing = lastUsedByConnection.get(key);
    if (!existing || new Date(t.last_used_at!) > new Date(existing)) {
      lastUsedByConnection.set(key, t.last_used_at!);
    }
  }

  const connections = (refreshRows ?? []).map((row) => ({
    id: row.id,
    clientName: (row.oauth_clients as unknown as { client_name: string } | null)?.client_name ?? "Unknown app",
    connectedByName: (row.profiles as unknown as { name: string | null } | null)?.name ?? null,
    scopes: row.scopes ?? [],
    lastUsedAt: lastUsedByConnection.get(`${row.client_id}:${row.user_id}`) ?? row.last_used_at,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ connections });
}
