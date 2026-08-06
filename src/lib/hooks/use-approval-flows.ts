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
      return (data.map(mapApprovalFlow)) as ApprovalFlow[];
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
 * Syncs a flow's steps to the given desired array — updating in place whatever
 * already exists, inserting genuinely new steps, and deleting genuinely
 * removed ones. Deliberately NOT a delete-all-and-reinsert: a full replace
 * nulls `flow_step_id` on every in-flight approval_requests row for this flow
 * (even ones whose step didn't actually change), which collapses distinct
 * steps into a single `null`-keyed group in the approval UI/decide logic and
 * can make a still-pending step look resolved. A pure reorder or label/role
 * edit on an existing step must not touch requests already pointing at it.
 *
 * New steps (added client-side, not yet persisted) carry a temp id that never
 * matches a real `approval_flow_steps.id` — anything not found in the current
 * DB rows for this flow is treated as new.
 */
export function useUpdateApprovalFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ flowId, steps }: { flowId: string; steps: ApprovalFlowStep[] }) => {
      const supabase = createClient();

      const { data: existingSteps } = await supabase
        .from("approval_flow_steps")
        .select("id")
        .eq("flow_id", flowId);
      const existingIds = new Set((existingSteps ?? []).map((s) => s.id));

      const toUpdate = steps.filter((s) => existingIds.has(s.id));
      const toInsert = steps.filter((s) => !existingIds.has(s.id));
      const keptIds = new Set(toUpdate.map((s) => s.id));
      const toDeleteIds = [...existingIds].filter((id) => !keptIds.has(id));

      // Only removed steps need their in-flight approval_requests unlinked
      // before deletion (FK safety net — the DB migration also sets this
      // ON DELETE SET NULL, but this covers environments where it hasn't
      // been applied yet).
      if (toDeleteIds.length > 0) {
        await supabase
          .from("approval_requests")
          .update({ flow_step_id: null })
          .in("flow_step_id", toDeleteIds);

        const { error: deleteErr } = await supabase
          .from("approval_flow_steps")
          .delete()
          .in("id", toDeleteIds);
        if (deleteErr) throw deleteErr;
      }

      // Update existing steps in place — preserves their id, so any
      // approval_requests.flow_step_id pointing at them stays valid.
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (!existingIds.has(s.id)) continue;
        const { error: updateErr } = await supabase
          .from("approval_flow_steps")
          .update({
            label: s.label,
            required_role: s.requiredRole,
            threshold_cents: s.thresholdCents,
            assigned_user_id: s.assignedUserId ?? null,
            order: i + 1,
          })
          .eq("id", s.id);
        if (updateErr) throw updateErr;
      }

      // Insert genuinely new steps
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from("approval_flow_steps")
          .insert(
            toInsert.map((s) => ({
              flow_id: flowId,
              label: s.label,
              required_role: s.requiredRole,
              threshold_cents: s.thresholdCents,
              assigned_user_id: s.assignedUserId ?? null,
              order: steps.indexOf(s) + 1,
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
