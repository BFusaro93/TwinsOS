import { adminClient } from "@/lib/api/auth";

/**
 * The DB trigger trg_chemical_confirmation_gate refuses to complete a visit
 * whose preloaded chemicals are unconfirmed (company mode `crew_required`, no
 * admin waiver). The stop clock-out completes several visits in a loop, so it
 * asks here FIRST — otherwise the gate could trip on the second sibling after
 * the first was already completed.
 *
 * Returns the human message to send back (HTTP 409), or null when completion is
 * allowed.
 */
export async function chemicalGateMessage(visitIds: string[]): Promise<string | null> {
  if (visitIds.length === 0) return null;
  const db = adminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (db as any)
    .from("crm_job_visits")
    .select("id, org_id, chemical_confirmation_waived_at")
    .in("id", visitIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = ((visits ?? []) as any[]).filter((v) => !v.chemical_confirmation_waived_at);
  if (live.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (db as any)
    .from("crm_chemical_settings")
    .select("confirmation_mode")
    .eq("org_id", live[0].org_id)
    .maybeSingle();
  if ((settings?.confirmation_mode ?? "crew_required") !== "crew_required") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (db as any)
    .from("crm_chemical_applications")
    .select("product:product_id(name)")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in("visit_id", live.map((v: any) => v.id))
    .eq("preloaded", true)
    .is("confirmed_at", null)
    .is("deleted_at", null);
  if (!rows || rows.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names = [...new Set((rows as any[]).map((r) => r.product?.name ?? "a chemical"))].join(", ");
  return `Confirm the amount used (or mark Not used) for ${names} before finishing this job.`;
}

/** A trigger refusal that slipped past the pre-check (a race) — same 409. */
export function isChemicalGateError(message: string | undefined | null): boolean {
  return !!message && message.includes("chemical_confirmation_required");
}
