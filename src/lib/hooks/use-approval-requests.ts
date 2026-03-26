import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapApprovalRequest } from "@/lib/supabase/mappers";
import type { ApprovalRequest, ApprovalRequestStatus, ApprovalFlow } from "@/types";

export function useApprovalRequests(entityId: string) {
  return useQuery<ApprovalRequest[]>({
    queryKey: ["approval-requests", entityId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("entity_id", entityId)
        .order("order", { ascending: true });
      if (error) throw error;
      return data.map(mapApprovalRequest);
    },
    enabled: !!entityId,
  });
}

interface SubmitForApprovalArgs {
  entityId: string;
  entityType: ApprovalFlow["entityType"];
  grandTotalCents: number;
}

export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entityId, entityType, grandTotalCents }: SubmitForApprovalArgs) => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const orgId = profile.org_id;

      const { data: flow } = await supabase
        .from("approval_flows")
        .select("*, approval_flow_steps(*)")
        .eq("entity_type", entityType)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!flow) return;

      const { data: orgUsers } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("org_id", orgId);

      // Drop any previous requests for this entity
      await supabase
        .from("approval_requests")
        .delete()
        .eq("entity_id", entityId)
        .eq("org_id", orgId);

      type StepRow = { id: string; order: number; required_role: string; threshold_cents: number; assigned_user_id: string | null };
      const steps = ((flow as unknown as { approval_flow_steps?: StepRow[] }).approval_flow_steps ?? [])
        .sort((a, b) => a.order - b.order);

      const newRequests: Array<{
        org_id: string; entity_type: string; entity_id: string;
        flow_step_id: string; order: number; approver_id: string;
        approver_name: string; approver_role: string; status: string;
      }> = [];

      for (const step of steps) {
        const isRequired = step.threshold_cents === 0 || grandTotalCents >= step.threshold_cents;

        if (step.assigned_user_id) {
          const approver = orgUsers?.find((u) => u.id === step.assigned_user_id);
          newRequests.push({
            org_id: orgId, entity_type: entityType, entity_id: entityId,
            flow_step_id: step.id, order: step.order,
            approver_id: step.assigned_user_id,
            approver_name: approver?.name ?? "Unknown",
            approver_role: step.required_role,
            status: isRequired ? "pending" : "skipped",
          });
        } else {
          const approvers = orgUsers?.filter((u) => u.role === step.required_role) ?? [];
          const targets = approvers.length > 0
            ? approvers
            : (orgUsers?.filter((u) => u.role === "admin").slice(0, 1) ?? []);

          for (const approver of targets) {
            newRequests.push({
              org_id: orgId, entity_type: entityType, entity_id: entityId,
              flow_step_id: step.id, order: step.order,
              approver_id: approver.id, approver_name: approver.name,
              approver_role: step.required_role,
              status: isRequired ? "pending" : "skipped",
            });
          }
        }
      }

      if (newRequests.length > 0) {
        const { error } = await supabase.from("approval_requests").insert(newRequests);
        if (error) throw error;
      }
    },
    onSuccess: (_, { entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-requests", entityId] });
    },
  });
}

interface DecideApprovalArgs {
  requestId: string;
  status: ApprovalRequestStatus;
  comment?: string;
}

export function useDecideApproval(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, status, comment }: DecideApprovalArgs) => {
      const supabase = createClient();
      const now = new Date().toISOString();

      const { data: decided, error: fetchErr } = await supabase
        .from("approval_requests")
        .select("flow_step_id, entity_id")
        .eq("id", requestId)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: updateErr } = await supabase
        .from("approval_requests")
        .update({ status, comment: comment ?? null, decided_at: now })
        .eq("id", requestId);
      if (updateErr) throw updateErr;

      if (decided.flow_step_id) {
        await supabase
          .from("approval_requests")
          .update({ status: "superseded" })
          .eq("entity_id", decided.entity_id)
          .eq("flow_step_id", decided.flow_step_id)
          .neq("id", requestId)
          .eq("status", "pending");
      }

      const { data: fresh, error: freshErr } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("entity_id", entityId)
        .order("order", { ascending: true });
      if (freshErr) throw freshErr;
      return fresh.map(mapApprovalRequest);
    },
    onSuccess: (freshRequests) => {
      if (freshRequests) {
        queryClient.setQueryData(["approval-requests", entityId], freshRequests);
      }
    },
  });
}
