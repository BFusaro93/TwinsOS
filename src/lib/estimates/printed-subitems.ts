/**
 * Sub-items that print under their parent line on the client-facing estimate.
 * One place so the Preview/Print PDF and the emailed copy list the same rows.
 */

export interface PrintedSubitem {
  name: string;
  qty: number;
  rateCents: number;
  totalCents: number;
}

type SubitemRow = {
  name?: string | null;
  qty?: number | null;
  rate_cents?: number | null;
  total_cents?: number | null;
  print_on_estimate?: boolean | null;
  deleted_at?: string | null;
  sort_order?: number | null;
};

/** Select fragment to embed under estimate_line_items(...). */
// `*` (not named columns) so a deploy that lands before the print_on_estimate
// migration can't fail the whole estimate query; the flag just reads as unset.
export const PRINTED_SUBITEM_SELECT = "estimate_line_item_subitems(*)";

export function pickPrintedSubitems(rows: unknown): PrintedSubitem[] {
  if (!Array.isArray(rows)) return [];
  return (rows as SubitemRow[])
    .filter((s) => !s.deleted_at && s.print_on_estimate === true && !!s.name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => ({
      name: s.name as string,
      qty: s.qty ?? 1,
      rateCents: s.rate_cents ?? 0,
      totalCents: s.total_cents ?? 0,
    }));
}
