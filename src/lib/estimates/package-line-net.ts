/** What an estimate line contributes to the total: net of its discount, plus its priced
 *  sub-items (all of them when the caller has the total, else the printed ones). */
export function packageLineNetCents(li: {
  totalCents: number;
  discountCents?: number | null;
  subitemTotalCents?: number | null;
  subitems?: { totalCents: number }[];
}): number {
  const subs = li.subitemTotalCents ?? (li.subitems ?? []).reduce((s, x) => s + (x.totalCents ?? 0), 0);
  return Math.max(0, li.totalCents - (li.discountCents ?? 0)) + subs;
}
