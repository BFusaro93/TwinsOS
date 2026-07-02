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

/**
 * Resolves the portal context (clientId, orgId) from the current Supabase session.
 * Returns null if the user is not authenticated or not a portal user.
 * Note: cast to unknown first because client_portal_users is not yet in generated types.
 * Run `npx supabase gen types` after applying migration 20260630000003.
 */
export async function getPortalContext(): Promise<PortalContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("client_portal_users")
    .select("client_id, org_id, email")
    .eq("user_id", user.id)
    .single() as { data: PortalUserRow | null };

  if (!data) return null;

  return {
    userId: user.id,
    clientId: data.client_id,
    orgId: data.org_id,
    email: data.email,
  };
}
