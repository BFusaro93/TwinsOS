import { useState, useMemo } from "react";

type SortDir = "asc" | "desc";

/**
 * Generic table sort hook.
 * Keeps sort key + direction in state, and returns a sorted copy of `items`.
 *
 * Usage:
 *   const { sortKey, sortDir, toggle, sorted } = useSort(rows, "createdAt", "desc");
 *   // render `sorted`, pass `toggle` to SortableTableHead
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSort<T extends Record<string, any>>(
  items: T[],
  defaultKey: string,
  defaultDir: SortDir = "asc",
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
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Handle nullish values — push to bottom
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
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
  }, [items, sortKey, sortDir]);

  return { sortKey, sortDir, toggle, sorted };
}
