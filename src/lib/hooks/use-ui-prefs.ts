"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/supabase";

/** Per-user UI preferences (e.g. which columns are visible on a given
 *  view), stored as one jsonb blob on the caller's own profile row. */
export function useUiPrefs() {
  return useQuery({
    queryKey: ["ui-prefs"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return {} as Record<string, unknown>;
      const { data, error } = await supabase
        .from("profiles")
        .select("ui_prefs")
        .eq("id", auth.user.id)
        .single();
      if (error) throw error;
      return (data?.ui_prefs ?? {}) as Record<string, unknown>;
    },
  });
}

export function useSetUiPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const current = (qc.getQueryData(["ui-prefs"]) as Record<string, unknown>) ?? {};
      const next = { ...current, [key]: value };
      const { error } = await supabase
        .from("profiles")
        .update({ ui_prefs: next as Json })
        .eq("id", auth.user.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      if (next) qc.setQueryData(["ui-prefs"], next);
    },
  });
}

/**
 * Column visibility for one view, persisted to the current user's profile
 * so it survives a reload instead of resetting every time. Renders with
 * `defaultKeys` until the saved preference loads (avoiding a flash of
 * "every column visible"), then switches over once, if a saved list exists.
 */
export function usePersistedColumns(viewKey: string, defaultKeys: string[]) {
  const { data: prefs, isSuccess } = useUiPrefs();
  const setPref = useSetUiPref();
  const [visibleKeys, setVisibleKeysState] = useState<string[]>(defaultKeys);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (isSuccess && !appliedRef.current) {
      appliedRef.current = true;
      const saved = prefs?.[viewKey];
      if (Array.isArray(saved) && saved.every((k) => typeof k === "string")) {
        setVisibleKeysState(saved as string[]);
      }
    }
  }, [isSuccess, prefs, viewKey]);

  const setVisibleKeys = useCallback(
    (keys: string[]) => {
      setVisibleKeysState(keys);
      setPref.mutate({ key: viewKey, value: keys });
    },
    [viewKey, setPref]
  );

  return [visibleKeys, setVisibleKeys] as const;
}
