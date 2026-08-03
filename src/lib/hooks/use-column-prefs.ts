"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persists per-table column visibility to localStorage so table views stay
 * customized across sessions. `defaultVisible` is the fallback (and also
 * back-fills any newly-added column keys for users with stale saved prefs).
 */
export function useColumnPrefs(storageKey: string, defaultVisible: Record<string, boolean>) {
  const [visible, setVisibleState] = useState<Record<string, boolean>>(defaultVisible);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setVisibleState({ ...defaultVisible, ...JSON.parse(raw) });
    } catch {
      // ignore malformed/inaccessible storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = useCallback((key: string) => {
    setVisibleState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return { visible, toggle };
}
