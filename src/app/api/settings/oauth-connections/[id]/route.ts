import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";

/**
 * DELETE /api/settings/oauth-connections/[id] -- disconnects an OAuth
 * connection. [id] is the connection's refresh token row id (see the GET
 * route). Revokes that refresh token and every access token issued
 * alongside it for the same (client, user, org) triple -- there can be more
 * than one access token if the connection refreshed since it was first
 * created (PR 4's rotation issues a new pair each time), so this clears the
 * whole history rather than just the current pair. Admin-only, same as
 * revoking an API key.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const { data: connection } = await db
    .from("oauth_tokens")
    .select("client_id, user_id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .eq("token_type", "refresh")
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const { error } = await db
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", profile.org_id)
    .eq("client_id", connection.client_id)
    .eq("user_id", connection.user_id)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
