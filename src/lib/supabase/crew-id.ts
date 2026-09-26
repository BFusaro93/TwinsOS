/**
 * Crew-login lookup shared by the server routes (via route-auth.ts) and the
 * browser crew hooks (use-crew-app.ts). Lives in its own module because
 * route-auth.ts imports next/headers, which a "use client" hook can't pull in.
 *
 * Resolves the crm_crews row the authenticated caller IS (crew accounts log
 * in as the crew itself), scoped to org so a cross-org id can never match.
 *
 * Two things this deliberately does NOT do:
 *  - it doesn't match soft-deleted crews (`deleted_at IS NULL`), which is
 *    both the repo-wide query rule and the reason a retired crew's account
 *    can't keep acting on visits;
 *  - it doesn't use .maybeSingle(), which THROWS when more than one row
 *    comes back. The same auth user being attached to two crm_crews rows is
 *    a data problem, but it used to turn into a blanket 403 on every crew
 *    route with nothing in the response explaining why. Ordering by
 *    created_at and taking the first keeps the caller working on their
 *    original crew — and keeps every surface agreeing on WHICH crew.
 */
export async function fetchCallerCrew<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  columns = "id"
): Promise<T | null> {
  const { data } = await supabase
    .from("crm_crews")
    .select(columns)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const rows = (data ?? []) as T[];
  return rows[0] ?? null;
}

export async function resolveCallerCrewId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string
): Promise<string | null> {
  const crew = await fetchCallerCrew(supabase, userId, orgId);
  return crew?.id ?? null;
}
