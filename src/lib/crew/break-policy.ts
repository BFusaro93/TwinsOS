// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Whether crew pauses are paid. Kept apart from visit-labor.ts, which imports
 * the service client (next/headers), so payroll/compute.ts can be reused from
 * Report Center definitions that are also bundled into client components.
 */

/**
 * Org default for crew pauses: unpaid unless the org explicitly turned
 * `customizations.crewBreaksUnpaid` off. Falls back to unpaid on a failed
 * read — the documented default — rather than throwing.
 */
export async function getCrewBreaksUnpaid(supabase: AnySupabase, orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return true;
  try {
    const { data } = await supabase.from("organizations").select("customizations").eq("id", orgId).maybeSingle();
    const v = (data?.customizations as Record<string, unknown> | null | undefined)?.crewBreaksUnpaid;
    return v !== false;
  } catch {
    return true;
  }
}

/**
 * Resolves whether a visit's break_minutes are UNPAID: the per-visit
 * break_paid override wins (true = paid, false = unpaid); NULL follows the org.
 */
export function isBreakUnpaid(breakPaid: boolean | null | undefined, orgBreaksUnpaid: boolean): boolean {
  return breakPaid == null ? orgBreaksUnpaid : !breakPaid;
}
