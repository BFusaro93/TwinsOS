/**
 * Completed visits that already carry a line on a live (not deleted, not
 * void) invoice can't be moved or un-completed — the invoice would bill a
 * visit the schedule no longer says happened. The DB trigger
 * trg_crm_job_visits_guard_invoiced (migration 20260927110100) is the floor;
 * these helpers let the API routes answer with a clear 409 first, and apply
 * an explicit admin override through crm_override_invoiced_visit().
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const INVOICED_VISIT_LOCKED_MESSAGE =
  "This visit is completed and already invoiced — void or edit the invoice first, or ask an admin to override.";
export const INVOICED_VISIT_LOCKED_CODE = "invoiced_visit_locked";

export interface VisitChangeRow {
  id: string;
  status: string;
  scheduled_date: string | null;
}

/** Ids among `rows` whose status/date change would hit an invoiced, completed visit. */
export async function findInvoicedLockedVisits(
  supabase: AnyClient,
  rows: VisitChangeRow[],
  change: { status?: string; scheduled_date?: string }
): Promise<Set<string>> {
  const candidates = rows.filter(
    (r) =>
      r.status === "completed" &&
      ((change.status !== undefined && change.status !== r.status) ||
        (change.scheduled_date !== undefined && change.scheduled_date !== r.scheduled_date))
  );
  const locked = new Set<string>();
  for (let i = 0; i < candidates.length; i += 100) {
    const ids = candidates.slice(i, i + 100).map((r) => r.id);
    const { data, error } = await supabase
      .from("crm_invoice_line_items")
      .select("visit_id, crm_invoices!inner(deleted_at, status)")
      .in("visit_id", ids)
      .is("crm_invoices.deleted_at", null)
      .neq("crm_invoices.status", "void");
    if (error) throw error;
    for (const l of (data ?? []) as { visit_id: string | null }[]) if (l.visit_id) locked.add(l.visit_id);
  }
  return locked;
}

/** Admin-only (enforced in SQL). Applies the status/date change to one locked visit. */
export async function overrideInvoicedVisit(
  supabase: AnyClient,
  visitId: string,
  change: { status?: string; scheduled_date?: string }
): Promise<{ error: string | null; forbidden: boolean }> {
  const { error } = await supabase.rpc("crm_override_invoiced_visit", {
    p_visit_id: visitId,
    p_status: change.status ?? null,
    p_scheduled_date: change.scheduled_date ?? null,
  });
  if (!error) return { error: null, forbidden: false };
  return { error: error.message as string, forbidden: (error as { code?: string }).code === "42501" };
}
