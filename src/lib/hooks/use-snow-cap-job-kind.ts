"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { SnowCapKind } from "@/lib/snow-caps";

/** Tags a contract's snow job as counting toward the inch cap or the salt cap. */
export function useSetJobSnowCapKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, kind }: { jobId: string; kind: SnowCapKind }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_jobs").update({ snow_cap_kind: kind }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snow-caps"] });
      qc.invalidateQueries({ queryKey: ["snow-invoicing"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
    },
  });
}
