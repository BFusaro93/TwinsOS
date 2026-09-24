"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { toast } from "sonner";
import { createClient, getAuthUser } from "@/lib/supabase/client";

/** Per-user UI preferences (e.g. which columns are visible on a given
 *  view), stored as one jsonb blob on the caller's own profile row. */
export function useUiPrefs() {
  return useQuery({
    queryKey: ["ui-prefs"],
    queryFn: async () => {
      const supabase = createClient();
      const user = await getAuthUser();
      if (!user) return {} as Record<string, unknown>;
      const { data, error } = await supabase
        .from("profiles")
        .select("ui_prefs")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return (data?.ui_prefs ?? {}) as Record<string, unknown>;
    },
    // The blob only ever changes through set_ui_pref below (which seeds the
    // cache with the authoritative post-merge value), so there is nothing to
    // gain from refetching it on every mount/focus.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Saves ONE key of the prefs blob.
 *
 * This deliberately does not read-modify-write the whole jsonb object from
 * the client: two views (dispatch board + waiting list), two browser tabs, or
 * a toggle fired before the prefs query had resolved would each send a full
 * blob built from a stale — or empty — snapshot and silently drop whatever
 * the other one had saved. `set_ui_pref` does the merge server-side with
 * `ui_prefs || jsonb_build_object(key, value)`, which is atomic per row, and
 * returns the merged blob so the cache is refreshed from the real value
 * rather than from our guess at it.
 */
export function useSetUiPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("set_ui_pref", {
        p_key: key,
        p_value: value,
      });
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
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
      // Applied locally first so the table reflows immediately; rolled back if
      // the save fails, so the layout on screen is never one the server didn't
      // actually take (the old code left the failed layout in place and the
      // user only found out on the next reload).
      const previous = visibleKeys;
      setVisibleKeysState(keys);
      setPref.mutate(
        { key: viewKey, value: keys },
        {
          onError: () => {
            setVisibleKeysState(previous);
            toast.error("Couldn't save your column layout");
          },
        }
      );
    },
    [viewKey, setPref, visibleKeys]
  );

  return [visibleKeys, setVisibleKeys] as const;
}
