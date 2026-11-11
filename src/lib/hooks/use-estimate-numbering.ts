"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

export interface EstimateNumbering {
  /** null when the org isn't on its own numbering yet (numbers come from the shared sequence). */
  nextNumber: number | null;
  maxExisting: number | null;
  perOrg: boolean;
}

/** The number the next estimate will get, plus the highest estimate number in use. */
export function useEstimateNumbering() {
  return useQuery({
    queryKey: ["estimate-numbering"],
    queryFn: async (): Promise<EstimateNumbering> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_estimate_numbering");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { next_number: number | null; max_existing: number | null; per_org: boolean } | null;
      return {
        nextNumber: row?.next_number != null ? Number(row.next_number) : null,
        maxExisting: row?.max_existing != null ? Number(row.max_existing) : null,
        perOrg: !!row?.per_org,
      };
    },
  });
}

/** Start estimates at #N (e.g. continuing the sequence from the software the org is leaving). */
export function useSetNextEstimateNumber() {
  const qc = useQueryClient();
  return useMutation({
    /** Resolves to the number the next estimate will actually get (never below the highest in use). */
    mutationFn: async (next: number): Promise<number> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("set_next_estimate_number", { p_next: next });
      if (error) throw error;
      return typeof data === "number" ? data : next;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["estimate-numbering"] });
      void qc.invalidateQueries({ queryKey: ["invoice-numbering"] });
    },
  });
}
