/**
 * "On invoice" sub-items: a job service converted from an estimate carries a
 * snapshot of each sub-item's rate and print flag (crm_job_service_subitems
 * .rate_cents / .print_on_invoice). Their dollars are already inside the
 * service's price, so by default an invoice shows ONE service line. For
 * single-visit jobs, sub-items flagged "On invoice" are listed as their own
 * rows under the service and their amount is taken OUT of the service row —
 * the invoice total never changes; unflagged sub-items stay folded into the
 * service row.
 *
 * Single-visit job types only: a sub-item is priced for the whole line, while
 * a recurring/package service bills per visit, so itemizing there would repeat
 * (or mis-split) the sub-item on every visit.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const ITEMIZE_SUBITEM_JOB_TYPES = ["one_time", "waiting_list"];

export interface PrintedSubitem {
  name: string;
  qty: number;
  rateCents: number;
  totalCents: number;
}

export interface ItemizableLine {
  qty: number;
  rateCents: number;
  totalCents: number;
}

/** Flagged sub-items per job service, in display order. Empty for job types that never itemize. */
export async function loadPrintedSubitems(
  supabase: AnyClient,
  jobType: string | null | undefined,
  jobServiceIds: string[]
): Promise<Map<string, PrintedSubitem[]>> {
  const out = new Map<string, PrintedSubitem[]>();
  if (!jobType || !ITEMIZE_SUBITEM_JOB_TYPES.includes(jobType) || jobServiceIds.length === 0) return out;
  const { data, error } = await supabase
    .from("crm_job_service_subitems")
    .select("job_service_id, name, qty, rate_cents, sort_order")
    .in("job_service_id", jobServiceIds)
    .eq("print_on_invoice", true)
    .not("rate_cents", "is", null)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  // A deploy that lands before the migration must not break invoicing.
  if (error) return out;
  for (const r of (data ?? []) as { job_service_id: string; name: string; qty: number | string; rate_cents: number }[]) {
    const qty = Number(r.qty);
    if (!(qty > 0) || !(r.rate_cents >= 0)) continue;
    const list = out.get(r.job_service_id) ?? [];
    list.push({ name: r.name, qty, rateCents: r.rate_cents, totalCents: Math.round(qty * r.rate_cents) });
    out.set(r.job_service_id, list);
  }
  return out;
}

/**
 * Splits `printed` off a service line. Returns null when nothing can be split
 * (no sub-items, or they'd consume the whole line), so callers leave the line
 * untouched. The parent keeps its qty; its rate is re-derived from the
 * reduced total.
 */
export function splitPrintedSubitems(
  line: ItemizableLine,
  printed: PrintedSubitem[] | undefined
): { parent: { rateCents: number; totalCents: number }; children: PrintedSubitem[] } | null {
  if (!printed || printed.length === 0) return null;
  const sum = printed.reduce((s, p) => s + p.totalCents, 0);
  if (sum <= 0 || sum >= line.totalCents) return null;
  const total = line.totalCents - sum;
  return { parent: { totalCents: total, rateCents: line.qty > 0 ? Math.round(total / line.qty) : total }, children: printed };
}
