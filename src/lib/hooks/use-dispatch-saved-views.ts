import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/** Board filter state captured by a saved view. Dates are a relative mode, never absolute. */
export interface DispatchViewFilters {
  serviceFilters: string[];
  crewFilters: string[];
  tagFilters: string[];
  priorityFilters: string[];
  statusFilter: string;
  search: string;
  /** The board's single "Select a Filter" column filter (city/zip/etc.). */
  colFilterKey: string | null;
  colFilterValue: string;
  /** Stacked Select-a-Filter text values (client/date/city/zip). Newer views
   *  use this; older ones only have the single colFilterKey/Value above. */
  colFilters?: Record<string, string>;
  visibleKeys: string[];
  /** Relative range preset, or null when the dates were picked by hand (not saved). */
  dateMode: string | null;
}

export interface DispatchSavedView {
  id: string;
  name: string;
  filters: Partial<DispatchViewFilters>;
}

const QK = ["dispatch-saved-views"] as const;

export function useDispatchSavedViews() {
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const supabase = createClient();
      // crm_dispatch_saved_views isn't in the generated types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_dispatch_saved_views")
        .select("id, name, filters")
        .eq("board", "dispatch")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DispatchSavedView[];
    },
  });
}

// org_id and user_id come from column defaults (my_org_id() / auth.uid()).
export function useCreateDispatchSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; filters: DispatchViewFilters }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_dispatch_saved_views")
        .insert({ name: input.name, filters: input.filters })
        .select("id, name, filters")
        .single();
      if (error) throw error;
      return data as DispatchSavedView;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateDispatchSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; filters: DispatchViewFilters }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_dispatch_saved_views")
        .update({ filters: input.filters })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QK }),
  });
}

/** Soft delete. */
export function useDeleteDispatchSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_dispatch_saved_views")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QK }),
  });
}
