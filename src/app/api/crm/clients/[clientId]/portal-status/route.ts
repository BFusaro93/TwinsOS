import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { PortalInviteRow, PortalUserRow } from "@/lib/portal/portal-db";

export type ClientPortalStatus = "none" | "invited" | "active";

export interface ClientPortalStatusResponse {
  status: ClientPortalStatus;
  /** Portal login email (active) or the address the invite went to (invited). */
  email: string | null;
  /** Active: when the client registered. */
  activeSince: string | null;
  /** Active: auth.users.last_sign_in_at — null when they've never signed in. */
  lastLoginAt: string | null;
  /** Latest invite (pending or expired) when there is no active account. */
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  inviteExpired: boolean;
}

/**
 * GET — the office-side view of a client's portal access: no access / invited
 * (pending or expired link) / active (with last login). Read-only; RLS scopes
 * the portal tables to the caller's org, and the service client is used ONLY
 * to read last_sign_in_at for a portal user already resolved through RLS.
 */
export async function GET(
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

  const { clientId } = await params;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: portalUser } = await (supabase as any)
    .from("client_portal_users")
    .select("id, user_id, email, created_at")
    .eq("client_id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: Pick<PortalUserRow, "id" | "user_id" | "email" | "created_at"> | null };

  if (portalUser) {
    let lastLoginAt: string | null = null;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createServiceClient();
        const { data } = await admin.auth.admin.getUserById(portalUser.user_id);
        lastLoginAt = data?.user?.last_sign_in_at ?? null;
      } catch {
        // Best-effort — the status itself doesn't depend on it.
        lastLoginAt = null;
      }
    }
    const body: ClientPortalStatusResponse = {
      status: "active",
      email: portalUser.email,
      activeSince: portalUser.created_at,
      lastLoginAt,
      invitedAt: null,
      inviteExpiresAt: null,
      inviteExpired: false,
    };
    return NextResponse.json(body);
  }

  // No account — surface the most recent invite, pending or expired. Invites
  // are "revoked" by stamping accepted_at (see portal-invite / portal-reset),
  // so an un-accepted row is the only kind that still counts as an invite.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite } = await (supabase as any)
    .from("client_portal_invites")
    .select("email, created_at, expires_at")
    .eq("client_id", clientId)
    .eq("org_id", profile.org_id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: Pick<PortalInviteRow, "email" | "created_at" | "expires_at"> | null };

  if (invite) {
    const body: ClientPortalStatusResponse = {
      status: "invited",
      email: invite.email,
      activeSince: null,
      lastLoginAt: null,
      invitedAt: invite.created_at,
      inviteExpiresAt: invite.expires_at,
      inviteExpired: new Date(invite.expires_at).getTime() < Date.now(),
    };
    return NextResponse.json(body);
  }

  const body: ClientPortalStatusResponse = {
    status: "none",
    email: null,
    activeSince: null,
    lastLoginAt: null,
    invitedAt: null,
    inviteExpiresAt: null,
    inviteExpired: false,
  };
  return NextResponse.json(body);
}
