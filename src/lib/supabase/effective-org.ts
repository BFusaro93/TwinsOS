/**
 * The org a request acts on behalf of: the caller's own org, or — for staff with
 * an active impersonation session — the impersonated org. Resolved through the
 * `my_org_id()` RPC (the same function RLS uses) rather than `profiles.org_id`,
 * which is always the staff member's OWN org: scoping a route with that value
 * made every row of the impersonated org "not found" and sent writes to the
 * wrong org.
 *
 * Returns null when the RPC fails or the caller has no active profile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEffectiveOrgId(supabase: any): Promise<string | null> {
  const { data } = await supabase.rpc("my_org_id");
  return typeof data === "string" ? data : null;
}
