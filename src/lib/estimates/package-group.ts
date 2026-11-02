import type { EstimateLineItem } from "@/types/crm-estimates";

/**
 * The lines that belong to a package header: the rows that FOLLOW it, in sort order, while
 * they are not a section and carry the header's package_id. Membership is positional (same
 * rule as groupIntoSections and the email grid), so a package added twice — two headers with
 * the same package_id — is two separate groups, and lines hidden by a status filter still
 * count because the caller passes the full line list.
 */
export function packageGroupLineIds(headerId: string, allItems: EstimateLineItem[]): string[] {
  const ordered = [...allItems]
    .filter((i) => !i.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idx = ordered.findIndex((i) => i.id === headerId);
  const header = ordered[idx];
  if (idx === -1 || header.rowType !== "section" || !header.packageId) return [];
  const ids: string[] = [];
  for (let j = idx + 1; j < ordered.length; j++) {
    const row = ordered[j];
    if (row.rowType === "section" || row.packageId !== header.packageId) break;
    ids.push(row.id);
  }
  return ids;
}

/** Package headers whose every tagged line is in `deletingIds` — they would be left empty. */
export function packageHeadersEmptiedBy(deletingIds: Set<string>, allItems: EstimateLineItem[]): string[] {
  return allItems
    .filter((i) => !i.deletedAt && i.rowType === "section" && !!i.packageId && !deletingIds.has(i.id))
    .filter((h) => {
      const group = packageGroupLineIds(h.id, allItems);
      return group.length > 0 && group.every((id) => deletingIds.has(id));
    })
    .map((h) => h.id);
}
