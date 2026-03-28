import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapApprovalRequest } from "@/lib/supabase/mappers";
import { patchReqCache } from "./use-requisitions";
import { patchPOCache } from "./use-purchase-orders";
import type { ApprovalRequest, ApprovalRequestStatus, ApprovalFlow, Requisition, PurchaseOrder } from "@/types";

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

      // ── Update entity status to pending atomically in this mutation ──────────
      // This must happen before the component callback tries to do it separately,
      // so there is only ONE DB write, not two racing mutations.
      const table = entityType === "requisition" ? "requisitions" : "purchase_orders";
      const pendingStatus = entityType === "requisition" ? "pending_approval" : "pending";
      const { error: statusErr } = await supabase
        .from(table)
        .update({ status: pendingStatus })
        .eq("id", entityId)
        .select("id")
        .single();
      if (statusErr) throw statusErr;

      const { data: flow } = await supabase
        .from("approval_flows")
        .select("*, approval_flow_steps(*)")
        .eq("entity_type", entityType)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!flow) return { entityType };

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

      return { entityType };
    },
    onMutate: async ({ entityId, entityType }) => {
      // Cancel in-flight entity refetches so stale data cannot overwrite the cache
      await queryClient.cancelQueries({ queryKey: ["requisitions"] });
      await queryClient.cancelQueries({ queryKey: ["purchase-orders"] });
      const previousReqs = queryClient.getQueryData<Requisition[]>(["requisitions"]);
      const previousPOs = queryClient.getQueryData<PurchaseOrder[]>(["purchase-orders"]);

      // Optimistically set the entity to its pending status
      const pendingStatus = entityType === "requisition" ? "pending_approval" : "pending";
      if (entityType === "requisition") {
        patchReqCache(queryClient, entityId, { status: pendingStatus as Requisition["status"] });
      } else {
        patchPOCache(queryClient, entityId, { status: pendingStatus as PurchaseOrder["status"] });
      }

      return { previousReqs, previousPOs };
    },
    onSuccess: (_result, { entityId, entityType }) => {
      // Cancel refetches that Realtime triggered DURING the mutationFn.
      // cancelQueries aborts fetch signals synchronously — no await needed.
      queryClient.cancelQueries({ queryKey: ["requisitions"] });
      queryClient.cancelQueries({ queryKey: ["purchase-orders"] });

      // Re-patch the cache in case a cancelled refetch partially landed
      const pendingStatus = entityType === "requisition" ? "pending_approval" : "pending";
      if (entityType === "requisition") {
        patchReqCache(queryClient, entityId, { status: pendingStatus as Requisition["status"] });
      } else {
        patchPOCache(queryClient, entityId, { status: pendingStatus as PurchaseOrder["status"] });
      }

      queryClient.invalidateQueries({ queryKey: ["approval-requests", entityId] });
    },
    onError: (_err, _vars, context) => {
      if (context?.previousReqs) {
        queryClient.setQueryData<Requisition[]>(["requisitions"], context.previousReqs);
      }
      if (context?.previousPOs) {
        queryClient.setQueryData<PurchaseOrder[]>(["purchase-orders"], context.previousPOs);
      }
    },
    onSettled: (_data, _err, { entityType }) => {
      if (entityType === "requisition") {
        queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      }
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

      // Fetch the request first so we know flow_step_id and entity_type
      const { data: decided, error: fetchErr } = await supabase
        .from("approval_requests")
        .select("flow_step_id, entity_id, entity_type")
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

      const freshMapped = fresh.map(mapApprovalRequest);

      // ── Check if all approval steps are now resolved ──────────────────────
      // If so, update the entity status atomically here (not in a separate mutation).
      const stepGroups = new Map<string, typeof freshMapped>();
      for (const r of freshMapped) {
        if (!stepGroups.has(r.flowStepId)) stepGroups.set(r.flowStepId, []);
        stepGroups.get(r.flowStepId)!.push(r);
      }

      const allResolved =
        stepGroups.size > 0 &&
        Array.from(stepGroups.values()).every((reqs) => {
          if (reqs.every((r) => r.status === "skipped")) return true;
          if (reqs.some((r) => r.status === "approved")) return true;
          const active = reqs.filter((r) => r.status !== "skipped");
          return (
            active.length > 0 &&
            active.some((r) => r.status === "rejected") &&
            active.every((r) => r.status === "rejected" || r.status === "superseded")
          );
        });

      let newEntityStatus: string | undefined;

      if (allResolved) {
        const anyRejected = Array.from(stepGroups.values()).some((reqs) => {
          if (reqs.every((r) => r.status === "skipped")) return false;
          if (reqs.some((r) => r.status === "approved")) return false;
          return reqs.filter((r) => r.status !== "skipped").some((r) => r.status === "rejected");
        });

        newEntityStatus = anyRejected ? "rejected" : "approved";
        const entityType = decided.entity_type;
        const table = entityType === "requisition" ? "requisitions" : "purchase_orders";

        const { error: entityErr } = await supabase
          .from(table)
          .update({ status: newEntityStatus })
          .eq("id", entityId)
          .select("id")
          .single();
        if (entityErr) throw entityErr;
      }

      return { freshMapped, allResolved, entityType: decided.entity_type, newEntityStatus };
    },
    onMutate: async () => {
      // Cancel in-flight entity refetches so stale data cannot overwrite the cache
      await queryClient.cancelQueries({ queryKey: ["requisitions"] });
      await queryClient.cancelQueries({ queryKey: ["purchase-orders"] });
      const previousReqs = queryClient.getQueryData<Requisition[]>(["requisitions"]);
      const previousPOs = queryClient.getQueryData<PurchaseOrder[]>(["purchase-orders"]);
      return { previousReqs, previousPOs };
    },
    onSuccess: ({ freshMapped, allResolved, entityType, newEntityStatus }) => {
      // Cancel refetches that Realtime triggered DURING the mutationFn.
      // cancelQueries aborts fetch signals synchronously — no await needed.
      // IMPORTANT: must NOT be async — TanStack Query doesn't await onSuccess,
      // so onSettled would fire before this completes if we used await.
      queryClient.cancelQueries({ queryKey: ["requisitions"] });
      queryClient.cancelQueries({ queryKey: ["purchase-orders"] });

      // Patch approval-requests cache with fresh server data
      if (freshMapped) {
        queryClient.setQueryData(["approval-requests", entityId], freshMapped);
      }
      // Immediately patch entity cache so Realtime refetches can't revert the status
      if (allResolved && newEntityStatus) {
        if (entityType === "requisition") {
          patchReqCache(queryClient, entityId, { status: newEntityStatus as Requisition["status"] });
        } else {
          patchPOCache(queryClient, entityId, { status: newEntityStatus as PurchaseOrder["status"] });
        }
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousReqs) {
        queryClient.setQueryData<Requisition[]>(["requisitions"], context.previousReqs);
      }
      if (context?.previousPOs) {
        queryClient.setQueryData<PurchaseOrder[]>(["purchase-orders"], context.previousPOs);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}
