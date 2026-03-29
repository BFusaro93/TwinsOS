import { useState, useEffect, useCallback } from "react";

/**
 * useState backed by localStorage. Values persist across navigation
 * and page refreshes. Falls back to `defaultValue` when no saved
 * value exists or parsing fails.
 *
 * @param key      Unique localStorage key (e.g. "wo-filters")
 * @param defaultValue  Initial value when nothing is saved
 */
export function useStickyState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? (JSON.parse(saved) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable — ignore
    }
  }, [key, value]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => setValue(next),
    [],
  );

  return [value, set];
}
