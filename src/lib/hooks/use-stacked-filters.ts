"use client";

import { useMemo, useState } from "react";

/**
 * State for a "Select a Filter" bar where every filter keeps its own value so
 * they stack (AND together). `activeKey` only decides which input is showing;
 * switching tabs never clears the others.
 */
export function useStackedFilters<K extends string>() {
  const [activeKey, setActiveKey] = useState<K | null>(null);
  const [values, setValues] = useState<Partial<Record<K, string>>>({});

  const entries = useMemo(
    () => (Object.entries(values) as [K, string][]).filter(([, v]) => v.trim() !== ""),
    [values]
  );

  return {
    activeKey,
    values,
    /** Value of the filter whose input is showing. */
    filterValue: activeKey ? (values[activeKey] ?? "") : "",
    setFilterValue: (value: string) => {
      if (activeKey) setValues((prev) => ({ ...prev, [activeKey]: value }));
    },
    setValue: (key: K, value: string) => setValues((prev) => ({ ...prev, [key]: value })),
    /** Click on a filter tab: show/hide its input, keeping every value. */
    toggleKey: (key: K) => setActiveKey((cur) => (cur === key ? null : key)),
    /** The X next to the input: clears just that filter and closes it. */
    clearActive: () => {
      if (activeKey) setValues((prev) => ({ ...prev, [activeKey]: "" }));
      setActiveKey(null);
    },
    isSet: (key: K) => !!(values[key] ?? "").trim(),
    /** Non-empty filters as [key, value] pairs, for the filter predicate. */
    entries,
  };
}
