"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { parseInputs, type Inputs } from "@/lib/job-costing-calc";

export interface JobCostingScenario {
  id: string;
  name: string;
  inputs: Inputs;
  isDefault: boolean;
}

const KEY = ["job-costing-scenarios"] as const;

// job_costing_scenarios isn't in the generated Supabase types until the
// migration is applied and `supabase gen types` is re-run, so the client is
// loosely typed here (same approach as use-overhead-settings.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createClient();
}

export function useJobCostingScenarios() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<JobCostingScenario[]> => {
      const { data, error } = await db()
        .from("job_costing_scenarios")
        .select("id, name, inputs, is_default, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        inputs: parseInputs(r.inputs),
        isDefault: r.is_default === true,
      }));
    },
  });
}

export function useCreateJobCostingScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; inputs: Inputs; makeDefault?: boolean }) => {
      // org_id and created_by come from column defaults (my_org_id() / auth.uid()).
      const { data, error } = await db()
        .from("job_costing_scenarios")
        .insert({ name: input.name.trim() || "New Scenario", inputs: input.inputs })
        .select("id")
        .single();
      if (error) throw error;
      if (input.makeDefault) {
        const { error: rpcErr } = await db().rpc("set_default_job_costing_scenario", { p_id: data.id });
        if (rpcErr) throw rpcErr;
      }
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateJobCostingScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; inputs?: Inputs }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.inputs !== undefined) patch.inputs = input.inputs;
      const { data, error } = await db()
        .from("job_costing_scenarios")
        .update(patch)
        .eq("id", input.id)
        .select("id");
      if (error) throw error;
      // RLS filters rows silently; an empty result means the write was blocked.
      if (!data || data.length === 0) {
        throw new Error("Save was blocked — you don't have permission to change job costing scenarios.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Soft delete (CLAUDE.md: never hard delete). Deleting the default leaves the
 *  org with no default, so the calculator falls back to the blank form. */
export function useDeleteJobCostingScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db()
        .from("job_costing_scenarios")
        .update({ deleted_at: new Date().toISOString(), is_default: false })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Delete was blocked — you don't have permission to change job costing scenarios.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Pass null to clear the default. */
export function useSetDefaultJobCostingScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | null) => {
      const { error } = await db().rpc("set_default_job_costing_scenario", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
