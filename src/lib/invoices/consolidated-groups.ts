/**
 * Printed grouping for an invoice made by consolidating sub-account invoices onto their parent
 * (crm_consolidate_invoices). That function tags each moved line with its sub-account — a
 * "[Sub-account name] " prefix on the description (inside the first element when the
 * description is rich-text HTML) — and the parent's own lines carry no tag.
 *
 * For the customer's copy, lines are clustered by that tag under one header per sub-account /
 * property and the prefix is stripped (the header says it). The stored lines are untouched, so
 * the editor, totals and accounting sync are unaffected; only the printed order and headers
 * change. Lines keep their relative order inside a group, and groups appear in the order their
 * first line did.
 */

const TAG = /^(<[a-zA-Z][^>]*>)?\[([^\]]{1,120})\] ?/;

export function groupConsolidatedLines<T extends { description: string }>(
  lines: T[],
  /** Header for the parent account's own (untagged) lines; omitted → they print without a header. */
  ownLabel?: string | null
): (T & { groupHeader?: string })[] {
  const parsed = lines.map((line) => {
    const m = TAG.exec(line.description ?? "");
    return m
      ? { line: { ...line, description: (m[1] ?? "") + line.description.slice(m[0].length) }, group: m[2] }
      : { line: { ...line }, group: null as string | null };
  });
  // Nothing tagged: not a consolidation we know how to group — print as stored.
  if (!parsed.some((p) => p.group)) return lines.map((l) => ({ ...l }));

  const order: (string | null)[] = [];
  const buckets = new Map<string | null, (T & { groupHeader?: string })[]>();
  for (const p of parsed) {
    if (!buckets.has(p.group)) { buckets.set(p.group, []); order.push(p.group); }
    buckets.get(p.group)!.push(p.line);
  }
  // The parent's own lines (no tag) lead, then each sub-account in first-seen order.
  const ordered = [...order].sort((a, b) => (a === null ? -1 : b === null ? 1 : 0));
  const out: (T & { groupHeader?: string })[] = [];
  for (const g of ordered) {
    const group = buckets.get(g)!;
    const header = g ?? ownLabel ?? undefined;
    if (header) group[0] = { ...group[0], groupHeader: header };
    out.push(...group);
  }
  return out;
}
