/**
 * "On invoice" sub-items: a job service converted from an estimate carries a
 * snapshot of each sub-item's rate and print flag (crm_job_service_subitems
 * .rate_cents / .print_on_invoice). Their dollars are already inside the
 * service's price, so by default an invoice shows ONE service line. For
 * per-visit jobs, sub-items flagged "On invoice" are listed as their own
 * rows under the service and their amount is taken OUT of the service row —
 * the invoice total never changes; unflagged sub-items stay folded into the
 * service row.
 *
 * One-time, waiting-list and recurring jobs. A sub-item is priced for the WHOLE
 * estimate line (estimate-calc.ts); a recurring service divides the line over
 * its visits (max_visits), so each visit's price holds total / visits of it —
 * that share is what each visit's invoice itemizes (a $140 sub-item on a
 * 14-visit line is $10 a visit). Recurring needs max_visits; package jobs are
 * excluded (a package line becomes one service per visit and the sub-item
 * lives on the first only).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const ITEMIZE_SUBITEM_JOB_TYPES = ["one_time", "waiting_list", "recurring"];

export interface PrintedSubitem {
  name: string;
  /** Quantity per charge (estimate qty). */
  qty: number;
  /** Times charged over the whole line (estimate sub-item Visits; 1 = once for the whole line). */
  visits: number;
  rateCents: number;
  /** Over the whole line: qty x rate x visits. */
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
    .select("job_service_id, name, qty, visits, rate_cents, sort_order")
    .in("job_service_id", jobServiceIds)
    .eq("print_on_invoice", true)
    .not("rate_cents", "is", null)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  // A deploy that lands before the migration must not break invoicing.
  if (error) return out;
  for (const r of (data ?? []) as { job_service_id: string; name: string; qty: number | string; visits: number | null; rate_cents: number; sort_order: number }[]) {
    const qty = Number(r.qty);
    const visits = Math.max(1, Math.round(Number(r.visits ?? 1)));
    if (!(qty > 0) || !(r.rate_cents >= 0)) continue;
    const list = out.get(r.job_service_id) ?? [];
    list.push({ name: r.name, qty, visits, rateCents: r.rate_cents, totalCents: Math.round(qty * r.rate_cents * visits) });
    out.set(r.job_service_id, list);
  }
  return out;
}

/**
 * Splits `printed` off a service line. Returns null when nothing can be split
 * (no sub-items, or they'd consume the whole line), so callers leave the line
 * untouched. The parent keeps its qty; its rate is re-derived from the
 * reduced total.
 *
 * `lineVisits` is how many visits the service's price is spread over (the
 * recurring service's max_visits; 1 for a single-visit job). Each invoice
 * itemizes ONE visit's share of every sub-item:
 *   - Visits equal to the line's visits (charged every visit): qty x rate, exactly.
 *   - Single-visit job: the whole total (qty x visits x rate).
 *   - Anything else: total / line visits, as one unit.
 */
export function splitPrintedSubitems(
  line: ItemizableLine,
  printed: PrintedSubitem[] | undefined,
  lineVisits = 1
): { parent: { rateCents: number; totalCents: number }; children: ChildSubitem[] } | null {
  if (!printed || printed.length === 0 || !(lineVisits >= 1)) return null;
  const children: ChildSubitem[] = printed.map((p) => {
    if (lineVisits === 1) {
      const qty = p.qty * p.visits;
      return { name: p.name, qty, rateCents: p.rateCents, totalCents: Math.round(qty * p.rateCents) };
    }
    if (p.visits === lineVisits) {
      return { name: p.name, qty: p.qty, rateCents: p.rateCents, totalCents: Math.round(p.qty * p.rateCents) };
    }
    // Charged once for the whole line, with a quantity that divides evenly across the visits.
    const qtyPerVisit = p.visits === 1 ? p.qty / lineVisits : NaN;
    if (Number.isInteger(qtyPerVisit) && qtyPerVisit > 0) {
      return { name: p.name, qty: qtyPerVisit, rateCents: p.rateCents, totalCents: Math.round(qtyPerVisit * p.rateCents) };
    }
    const share = Math.round(p.totalCents / lineVisits);
    return { name: p.name, qty: 1, rateCents: share, totalCents: share };
  });
  const sum = children.reduce((s, p) => s + p.totalCents, 0);
  if (sum <= 0 || sum >= line.totalCents) return null;
  const total = line.totalCents - sum;
  return { parent: { totalCents: total, rateCents: line.qty > 0 ? Math.round(total / line.qty) : total }, children };
}

/** One itemized invoice row. */
export interface ChildSubitem {
  name: string;
  qty: number;
  rateCents: number;
  totalCents: number;
}
