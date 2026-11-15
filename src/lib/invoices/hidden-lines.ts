/**
 * Customer-facing roll-up for invoice lines marked "hide on invoice".
 *
 * A hidden line is still a real line on the invoice (it keeps its amount in
 * the stored subtotal, tax and total, its visit tag, its job-product link and
 * its accounting sync). Only what the customer sees changes: each hidden
 * line's amount — and its own discount — is folded into the nearest visible
 * line ABOVE it (the parent service it was entered under), or the nearest
 * visible line below it when nothing visible is above. Printed rows therefore
 * still add up to the printed Subtotal.
 *
 * If every line is hidden nothing is rolled up: an invoice with a balance but
 * no rows would be unreadable, so the flag is ignored.
 */

export interface RollUpLine {
  qty: number;
  rateCents: number;
  /** Gross line amount; the line's own discount comes off it. */
  totalCents: number;
  discountCents?: number;
  hideOnPrint?: boolean;
}

/** For each line, the index of the visible line it rolls into on the customer's
 *  invoice — null for a visible line, or when nothing is rolled up (no hidden lines,
 *  or every line hidden). The invoice editor shows this on hidden rows. */
export function hiddenLineTargets(lines: { hideOnPrint?: boolean }[]): (number | null)[] {
  if (!lines.some((l) => l.hideOnPrint) || lines.every((l) => l.hideOnPrint)) return lines.map(() => null);
  return lines.map((l, i) => {
    if (!l.hideOnPrint) return null;
    for (let j = i - 1; j >= 0; j--) if (!lines[j].hideOnPrint) return j;
    for (let j = i + 1; j < lines.length; j++) if (!lines[j].hideOnPrint) return j;
    return null;
  });
}

export function rollUpHiddenLines<T extends RollUpLine>(lines: T[]): T[] {
  if (!lines.some((l) => l.hideOnPrint) || lines.every((l) => l.hideOnPrint)) {
    return lines.map((l) => ({ ...l }));
  }
  const out = lines.map((l) => ({ ...l }));
  const absorbed = new Map<number, { total: number; discount: number }>();
  const targets = hiddenLineTargets(lines);

  lines.forEach((l, i) => {
    const target = targets[i];
    if (!l.hideOnPrint || target == null) return;
    const prev = absorbed.get(target) ?? { total: 0, discount: 0 };
    absorbed.set(target, { total: prev.total + l.totalCents, discount: prev.discount + (l.discountCents ?? 0) });
  });

  for (const [idx, add] of absorbed) {
    const t = out[idx];
    t.totalCents += add.total;
    t.discountCents = (t.discountCents ?? 0) + add.discount;
    // Keep the printed row's own arithmetic (qty × rate) consistent with its total.
    t.rateCents = t.qty > 0 ? Math.round(t.totalCents / t.qty) : t.totalCents;
  }
  return out.filter((_, i) => !lines[i].hideOnPrint);
}
