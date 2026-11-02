"use client";

import { useEffect, useState } from "react";

/** `value`, but only after it has stopped changing for `delayMs` — so a
 *  server-side search runs once per pause in typing, not once per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
