"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

// apply_labor_rates_to_open_projects isn't in the generated types until the
// migration is applied and `supabase gen types` is re-run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createClient();
}

/** How many open (sold / scheduled / in progress / on hold) projects carry a
 *  rate different from these. Completed and canceled projects are never counted. */
export function useOpenProjectsWithDifferentRates(
  laborRateCents: number,
  burdenedRateCents: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["open-projects-rate-diff", laborRateCents, burdenedRateCents],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await db().rpc("apply_labor_rates_to_open_projects", {
        p_labor_rate_cents: laborRateCents,
        p_burdened_rate_cents: burdenedRateCents,
        p_dry_run: true,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

export function useApplyRatesToOpenProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { laborRateCents: number; burdenedRateCents: number }): Promise<number> => {
      const { data, error } = await db().rpc("apply_labor_rates_to_open_projects", {
        p_labor_rate_cents: input.laborRateCents,
        p_burdened_rate_cents: input.burdenedRateCents,
        p_dry_run: false,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["open-projects-rate-diff"] });
    },
  });
}
