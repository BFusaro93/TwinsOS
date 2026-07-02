import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Categories visible to a client in the portal. If the org has explicitly
 * curated a subset via Settings > Client Portal, use that. Otherwise fall
 * back to the org's full `ticket_categories` list (not an unrelated
 * hardcoded default) so every category the org has defined is selectable
 * until an admin narrows it down.
 */
export async function getEffectiveTicketCategories(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  orgId: string,
  configured: string[] | null | undefined
): Promise<string[]> {
  if (configured && configured.length > 0) return configured;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("crm_list_options")
    .select("value")
    .eq("org_id", orgId)
    .eq("list_name", "ticket_categories")
    .is("deleted_at", null)
    .order("sort_order")
    .order("value");

  return (data ?? []).map((row: { value: string }) => row.value);
}
