import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface PortalContext {
  userId: string;
  clientId: string;
  orgId: string;
  email: string;
}

interface PortalUserRow {
  client_id: string;
  org_id: string;
  email: string;
}

/** Cookie holding which org's portal a signed-in user with more than one
 * client_portal_users row is currently viewing — set by
 * /api/portal/select-org after the user picks one on /portal/select-org. */
export const PORTAL_ACTIVE_ORG_COOKIE = "portal_org_id";

/**
 * Resolves the portal context (clientId, orgId) from the current Supabase
 * session. Returns null in two different situations a caller may need to
 * tell apart:
 * - not authenticated, or authenticated but not a portal user at all
 * - a portal user with MORE THAN ONE org (a person who is a client of two
 *   different Landscapt-using companies under the same email) and no
 *   active-org cookie yet, or one that no longer matches any of their orgs
 * Callers that need to distinguish these two cases (to redirect to
 * /portal/login vs. /portal/select-org) should call getPortalOrgChoices()
 * when this returns null.
 *
 * Note: cast to unknown first because client_portal_users is not yet in generated types.
 * Run `npx supabase gen types` after applying migration 20260630000003.
 */
export async function getPortalContext(): Promise<PortalContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const rows = await portalRowsForUser(supabase, user.id);
  if (rows.length === 0) return null;

  if (rows.length === 1) {
    const row = rows[0];
    return { userId: user.id, clientId: row.client_id, orgId: row.org_id, email: row.email };
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(PORTAL_ACTIVE_ORG_COOKIE)?.value;
  const active = rows.find((r) => r.org_id === activeOrgId);
  if (!active) return null; // ambiguous — caller should send them to the org picker

  return { userId: user.id, clientId: active.client_id, orgId: active.org_id, email: active.email };
}

/** Every org the currently-authenticated user has a portal account for.
 * Empty if not authenticated or not a portal user anywhere. Used by the
 * org-picker page, and by callers of getPortalContext() to tell "not a
 * portal user" apart from "portal user who needs to pick an org." */
export async function getPortalOrgChoices(): Promise<PortalUserRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  return portalRowsForUser(supabase, user.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function portalRowsForUser(supabase: any, userId: string): Promise<PortalUserRow[]> {
  const { data } = await supabase
    .from("client_portal_users")
    .select("client_id, org_id, email")
    .eq("user_id", userId)
    .is("deleted_at", null);
  return (data ?? []) as PortalUserRow[];
}
