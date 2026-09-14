import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Granular per-role permission (shared with portal-invite) — admins
  // always pass, otherwise gated by crm_roles.permissions.client_reset_portal_password.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "client_reset_portal_password",
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientId } = await params;

  // Find the portal user for this client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: portalUser } = await (supabase as any)
    .from("client_portal_users")
    .select("id, user_id")
    .eq("client_id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single() as { data: { id: string; user_id: string } | null };

  if (!portalUser) {
    return NextResponse.json({ error: "No portal account found for this client" }, { status: 404 });
  }

  // Soft-delete the portal_users row — this project never hard-deletes
  // records (see CLAUDE.md); the underlying auth user is still fully
  // removed below, which is what actually revokes login access.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_portal_users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", portalUser.id);

  // Revoke any pending invites
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_portal_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("accepted_at", null);

  // Delete the auth user via service role so the email can be reused — but
  // ONLY if this user has no other still-active portal link. Since
  // client_portal_users supports one auth user holding a row per org (a
  // client who is a portal user of two different orgs), deleting the auth
  // user unconditionally here would destroy that OTHER org's login too and
  // orphan its client_portal_users row (user_id pointing at a deleted auth
  // user, blocking any future re-link by email).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: otherActiveLinks } = await (adminClient as any)
      .from("client_portal_users")
      .select("id")
      .eq("user_id", portalUser.user_id)
      .is("deleted_at", null)
      .limit(1);
    if (!otherActiveLinks?.length) {
      await adminClient.auth.admin.deleteUser(portalUser.user_id);
    }
  }

  return NextResponse.json({ success: true });
}
