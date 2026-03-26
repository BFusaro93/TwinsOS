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

/**
 * Replaces all steps for a given flow by deleting existing steps and inserting the new set.
 * This is a full replace — the caller passes the complete desired step array.
 */
export function useUpdateApprovalFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ flowId, steps }: { flowId: string; steps: ApprovalFlowStep[] }) => {
      const supabase = createClient();

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
