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
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "manager"].includes(profile.role ?? "")) {
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
    .single() as { data: { id: string; user_id: string } | null };

  if (!portalUser) {
    return NextResponse.json({ error: "No portal account found for this client" }, { status: 404 });
  }

  // Delete the portal_users row first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_portal_users")
    .delete()
    .eq("id", portalUser.id);

  // Revoke any pending invites
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_portal_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("accepted_at", null);

  // Delete the auth user via service role so the email can be reused
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await adminClient.auth.admin.deleteUser(portalUser.user_id);
  }

  return NextResponse.json({ success: true });
}
