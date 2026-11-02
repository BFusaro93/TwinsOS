import { createServiceClient } from "@/lib/supabase/server";

/**
 * Every visit id of the multi-crew stop `visit` belongs to (itself included). Per-visit
 * material rows live on the LEAD visit, so a secondary crew — or the crew promoted to lead
 * after a failover — must be able to see and record them too. Read with the service client
 * (the caller's ownership of `visit` is checked first): a crew's own session can't read
 * another crew's sibling visit.
 */
export async function crewGroupVisitIds(visit: { id: string; org_id: string; crew_group_id?: string | null }): Promise<Set<string>> {
  const ids = new Set<string>([visit.id]);
  if (!visit.crew_group_id) return ids;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createServiceClient() as any)
    .from("crm_job_visits")
    .select("id")
    .eq("org_id", visit.org_id)
    .eq("crew_group_id", visit.crew_group_id);
  for (const row of (data ?? []) as { id: string }[]) ids.add(row.id);
  return ids;
}
