import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapApprovalFlow } from "@/lib/supabase/mappers";
import type { ApprovalFlow, ApprovalFlowStep } from "@/types";

export function useApprovalFlows() {
  return useQuery<ApprovalFlow[]>({
    queryKey: ["approval-flows"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("approval_flows")
        .select("*, approval_flow_steps(*)")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data.map(mapApprovalFlow);
    },
  });
}

export function useApprovalFlow(entityType: ApprovalFlow["entityType"]) {
  return useQuery<ApprovalFlow | null>({
    queryKey: ["approval-flows", entityType],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("approval_flows")
        .select("*, approval_flow_steps(*)")
        .eq("entity_type", entityType)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapApprovalFlow(data) : null;
    },
  });
}

/** Creates a new blank approval flow for the given entity type. */
export function useCreateApprovalFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, entityType }: { name: string; entityType: ApprovalFlow["entityType"] }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("approval_flows")
        .insert({ name, entity_type: entityType })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-flows"] });
    },
  });
}

/**
 * Replaces all steps for a given flow by deleting existing steps and inserting the new set.
 * This is a full replace — the caller passes the complete desired step array.
 */
export function useUpdateApprovalFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ flowId, steps }: { flowId: string; steps: ApprovalFlowStep[] }) => {
      const supabase = createClient();

      // Null out flow_step_id on any in-flight approval_requests that reference
      // the existing steps before we delete them.  Without this, the DELETE fails
      // with a foreign-key violation when there are approval_requests in progress.
      // (The DB migration adds ON DELETE SET NULL, but this ensures it works even
      // in environments where the migration has not yet been applied.)
      const { data: existingSteps } = await supabase
        .from("approval_flow_steps")
        .select("id")
        .eq("flow_id", flowId);

      if (existingSteps && existingSteps.length > 0) {
        await supabase
          .from("approval_requests")
          .update({ flow_step_id: null })
          .in("flow_step_id", existingSteps.map((s) => s.id));
      }

      // Delete all existing steps for this flow
      const { error: deleteErr } = await supabase
        .from("approval_flow_steps")
        .delete()
        .eq("flow_id", flowId);
      if (deleteErr) throw deleteErr;

      // Insert the new steps
      if (steps.length > 0) {
        const { error: insertErr } = await supabase
          .from("approval_flow_steps")
          .insert(
            steps.map((s, i) => ({
              flow_id: flowId,
              label: s.label,
              required_role: s.requiredRole,
              threshold_cents: s.thresholdCents,
              assigned_user_id: s.assignedUserId ?? null,
              order: i + 1,
            }))
          );
        if (insertErr) throw insertErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-flows"] });
    },
  });
}
