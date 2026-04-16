import { useState, useMemo } from "react";

type SortDir = "asc" | "desc";

/**
 * Generic table sort hook.
 * Keeps sort key + direction in state, and returns a sorted copy of `items`.
 *
 * Usage:
 *   const { sortKey, sortDir, toggle, sorted } = useSort(rows, "createdAt", "desc");
 *   // render `sorted`, pass `toggle` to SortableTableHead
 *
 * Pass `customOrders` to override alphabetical sorting for specific fields with
 * an explicit numeric rank. For example:
 *   customOrders={{ priority: { critical: 0, high: 1, medium: 2, low: 3 } }}
 * ensures "critical" sorts before "high" regardless of alphabetical order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSort<T extends Record<string, any>>(
  items: T[],
  defaultKey: string,
  defaultDir: SortDir = "asc",
  customOrders?: Record<string, Record<string, number>>,
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function toggle(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...items];
    const orderMap = customOrders?.[sortKey];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Handle nullish values — push to bottom
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp = 0;
      if (orderMap) {
        // Use explicit rank; unknown values sort after known ones
        const aRank = orderMap[String(aVal)] ?? Number.MAX_SAFE_INTEGER;
        const bRank = orderMap[String(bVal)] ?? Number.MAX_SAFE_INTEGER;
        cmp = aRank - bRank;
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir, customOrders]);

  return { sortKey, sortDir, toggle, sorted };
}
