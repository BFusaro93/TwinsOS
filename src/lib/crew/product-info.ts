/**
 * Product details a crew screen may show — name, part number and the chemical
 * label / safety fields — read through the crm_crew_product_info() definer
 * RPC (20270109000200).
 *
 * A crew login can't read product_items itself: its rows carry unit_cost,
 * price, cost_layers and quantity_on_hand, and RLS can't hide columns from one
 * role only, so crew is blocked from the table (20270109000210). Crew code that
 * used to embed `product:product_id(...)` reads the application / job-product
 * rows without the embed, then looks the products up here. Works with either a
 * browser or a server (session) client; the RPC scopes to the caller's org.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface CrewProductInfo {
  id: string;
  name: string | null;
  part_number: string | null;
  category: string | null;
  track_chemicals: boolean | null;
  epa_registration_number: string | null;
  re_entry_interval: string | null;
  label_instructions: string | null;
  restricted_product: boolean | null;
}

export async function loadCrewProductInfo(
  supabase: AnySupabase,
  productIds: (string | null | undefined)[]
): Promise<Map<string, CrewProductInfo>> {
  const ids = [...new Set(productIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("crm_crew_product_info", { p_product_ids: ids });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as CrewProductInfo[]).map((p) => [p.id, p]));
}
