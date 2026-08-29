import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * PATCH /api/settings/api-keys/[id] — removes an already-revoked key from
 * the list view (sets deleted_at). The row itself is never hard-deleted —
 * key_hash, scopes, and revoked_at stay intact for audit purposes, same
 * soft-delete convention as everywhere else in this app. Admin-only.
 */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: key } = await supabase
    .from("api_keys")
    .select("revoked_at")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single();
  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  if (!key.revoked_at) {
    return NextResponse.json({ error: "Revoke the key before removing it from the list" }, { status: 400 });
  }

  const { error } = await supabase
    .from("api_keys")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/settings/api-keys/[id] — revokes an API key (soft; sets revoked_at). Admin-only. */
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

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
