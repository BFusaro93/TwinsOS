import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceTimeZone, todayInZone } from "@/lib/time/zone";

/**
 * Whether an estimate's "Valid until" date has passed on the org's calendar.
 * The proposal link itself lives 30 days from when it was generated, so a
 * link could outlast the estimate — the page read "Valid until September 20"
 * and still let the client accept on the 24th. Valid through the whole of its
 * valid-until day; no date means no expiry.
 */
export async function isEstimatePastValidUntil(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  orgId: string,
  validUntil: string | null | undefined
): Promise<boolean> {
  if (!validUntil) return false;
  const { data: org } = await supabase.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  return validUntil.slice(0, 10) < todayInZone(coerceTimeZone((org as { timezone?: string } | null)?.timezone));
}
