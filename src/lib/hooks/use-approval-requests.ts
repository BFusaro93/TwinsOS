import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapApprovalRequest } from "@/lib/supabase/mappers";
import { patchReqCache } from "./use-requisitions";
import { patchPOCache } from "./use-purchase-orders";
import { suppressRealtime, resumeRealtime } from "./use-realtime";
import type { ApprovalRequest, ApprovalRequestStatus, ApprovalFlow, Requisition, PurchaseOrder } from "@/types";

type EntityType = ApprovalFlow["entityType"];

// Everything that differs between entity types the approval flow can gate.
// Adding a new entity type only means adding an entry here — the two mutations
// below contain no more per-type branching.
interface EntityConfig {
  table: "requisitions" | "purchase_orders" | "estimates";
  /** Column on `table` that carries the approval-driven status. For requisition/PO
   *  this doubles as their own lifecycle status; for crm_estimate it's a dedicated
   *  `approval_status` column so the estimate's sales-funnel `stage` is never touched. */
  statusColumn: string;
  pendingValue: string;
  queryKeys: string[][];
  /** Optimistic cache patch — omitted for entity types with no dedicated list cache
   *  to patch; those just rely on the queryKeys invalidation on settle. */
  patchCache?: (queryClient: ReturnType<typeof useQueryClient>, entityId: string, status: string) => void;
}

const ENTITY_CONFIG: Record<EntityType, EntityConfig> = {
  requisition: {
    table: "requisitions",
    statusColumn: "status",
    pendingValue: "pending_approval",
    queryKeys: [["requisitions"]],
    patchCache: (qc, id, status) => patchReqCache(qc, id, { status: status as Requisition["status"] }),
  },
  purchase_order: {
    table: "purchase_orders",
    statusColumn: "status",
    pendingValue: "pending",
    queryKeys: [["purchase-orders"]],
    patchCache: (qc, id, status) => patchPOCache(qc, id, { status: status as PurchaseOrder["status"] }),
  },
  crm_estimate: {
    table: "estimates",
    statusColumn: "approval_status",
    pendingValue: "pending",
    queryKeys: [["estimates"]],
  },
};

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
      return (data.map(mapApprovalRequest)) as ApprovalRequest[];
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
        .select("org_id, role")
        .eq("id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const orgId = profile.org_id;
      const submitterRole = profile.role as string | null;
      const cfg = ENTITY_CONFIG[entityType];

      // ── Update entity status to pending atomically in this mutation ──────────
      // This must happen before the component callback tries to do it separately,
      // so there is only ONE DB write, not two racing mutations.
      const { error: statusErr } = await supabase
        .from(cfg.table)
        .update({ [cfg.statusColumn]: cfg.pendingValue })
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

      // crm_estimate steps store a crm_roles.id (not a generic Role) — resolve the
      // people holding that role via their linked crm_employees.user_id.
      const { data: crmEmployees } = entityType === "crm_estimate"
        ? await supabase
            .from("crm_employees")
            .select("user_id, crm_role_id, first_name, last_name")
            .eq("org_id", orgId)
            .is("deleted_at", null)
        : { data: null };

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

      // Roles that admins outrank — steps requiring these roles are auto-skipped
      // when the submitter is an admin, since admins have full authority.
      const ADMIN_OUTRANKS = new Set(["manager"]);
      const submitterIsAdmin = submitterRole === "admin";

      for (const step of steps) {
        const isRequired = step.threshold_cents === 0 || grandTotalCents >= step.threshold_cents;

        // Admin submitters bypass any step whose required role is below admin
        // (e.g. "manager"). The step is still recorded but immediately skipped.
        const adminBypass = submitterIsAdmin && ADMIN_OUTRANKS.has(step.required_role);
        const effectiveStatus = (!isRequired || adminBypass) ? "skipped" : "pending";

        if (step.assigned_user_id) {
          const approver = orgUsers?.find((u) => u.id === step.assigned_user_id);
          newRequests.push({
            org_id: orgId, entity_type: entityType, entity_id: entityId,
            flow_step_id: step.id, order: step.order,
            approver_id: step.assigned_user_id,
            approver_name: approver?.name ?? "Unknown",
            approver_role: step.required_role,
            status: effectiveStatus,
          });
        } else if (entityType === "crm_estimate") {
          const roleHolders = (crmEmployees ?? []).filter(
            (e) => e.crm_role_id === step.required_role && e.user_id
          );
          const targets = roleHolders.map((e) => ({
            id: e.user_id as string,
            name: `${e.first_name} ${e.last_name}`,
          }));

          for (const approver of targets) {
            newRequests.push({
              org_id: orgId, entity_type: entityType, entity_id: entityId,
              flow_step_id: step.id, order: step.order,
              approver_id: approver.id, approver_name: approver.name,
              approver_role: step.required_role,
              status: effectiveStatus,
            });
          }
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
              status: effectiveStatus,
            });
          }
        }
      }

      if (newRequests.length > 0) {
        const { error } = await supabase.from("approval_requests").insert(newRequests);
        if (error) throw error;

        // If every step was skipped (threshold not met, admin bypass, or both),
        // there is nobody left to approve — auto-advance the entity to "approved"
        // right now rather than leaving it stuck in pending forever.
        const allSkipped = newRequests.every((r) => r.status === "skipped");
        if (allSkipped) {
          const { error: autoErr } = await supabase
            .from(cfg.table)
            .update({ [cfg.statusColumn]: "approved" })
            .eq("id", entityId);
          if (autoErr) throw autoErr;
          return { entityType, autoApproved: true };
        }

        // Fire approval notification emails (best-effort — don't block on failure)
        fetch("/api/approval-requests/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityId, entityType }),
        }).catch(() => {
          // Non-fatal — the approval request was created; email is best-effort
        });
      }

      return { entityType, autoApproved: false };
    },
    onMutate: async ({ entityId, entityType }) => {
      // Block Realtime invalidations for the entire mutation lifecycle
      suppressRealtime();

      const cfg = ENTITY_CONFIG[entityType];
      await queryClient.cancelQueries({ queryKey: ["requisitions"] });
      await queryClient.cancelQueries({ queryKey: ["purchase-orders"] });
      const previousReqs = queryClient.getQueryData<Requisition[]>(["requisitions"]);
      const previousPOs = queryClient.getQueryData<PurchaseOrder[]>(["purchase-orders"]);

      // Optimistically set the entity to its pending status
      cfg.patchCache?.(queryClient, entityId, cfg.pendingValue);

      return { previousReqs, previousPOs };
    },
    onSuccess: (result, { entityId, entityType }) => {
      const cfg = ENTITY_CONFIG[entityType];
      queryClient.invalidateQueries({ queryKey: ["approval-requests", entityId] });
      // If auto-approved (all steps skipped), patch the entity cache immediately
      // so the UI reflects "approved" without waiting for the invalidation refetch.
      if (result?.autoApproved) {
        cfg.patchCache?.(queryClient, entityId, "approved");
        // Notify the submitter that their entity was auto-approved (best-effort)
        fetch("/api/notifications/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "approved", entityId, entityType }),
        }).catch(() => {});
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
    onSettled: (_data, _err, { entityType }) => {
      // Release guard THEN invalidate — the refetch will see committed DB data
      resumeRealtime();
      const cfg = ENTITY_CONFIG[entityType];
      for (const key of cfg.queryKeys) queryClient.invalidateQueries({ queryKey: key });
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
        const entityType = decided.entity_type as EntityType;
        const cfg = ENTITY_CONFIG[entityType];

        const { error: entityErr } = await supabase
          .from(cfg.table)
          .update({ [cfg.statusColumn]: newEntityStatus })
          .eq("id", entityId)
          .select("id")
          .single();
        if (entityErr) throw entityErr;
      }

      return { freshMapped, allResolved, entityType: decided.entity_type, newEntityStatus };
    },
    onMutate: async () => {
      // Block Realtime invalidations for the entire mutation lifecycle
      suppressRealtime();

      await queryClient.cancelQueries({ queryKey: ["requisitions"] });
      await queryClient.cancelQueries({ queryKey: ["purchase-orders"] });
      const previousReqs = queryClient.getQueryData<Requisition[]>(["requisitions"]);
      const previousPOs = queryClient.getQueryData<PurchaseOrder[]>(["purchase-orders"]);
      return { previousReqs, previousPOs };
    },
    onSuccess: ({ freshMapped, allResolved, entityType, newEntityStatus }) => {
      // Patch approval-requests cache with fresh server data
      if (freshMapped) {
        queryClient.setQueryData(["approval-requests", entityId], freshMapped);
      }
      // Patch entity cache so UI reflects the new status immediately
      if (allResolved && newEntityStatus) {
        const cfg = ENTITY_CONFIG[entityType as EntityType];
        cfg.patchCache?.(queryClient, entityId, newEntityStatus);
        // Fire approved/rejected email to the submitter (best-effort)
        const emailType = newEntityStatus === "approved" ? "approved" : "rejected";
        fetch("/api/notifications/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: emailType, entityId, entityType }),
        }).catch(() => {});
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
      // Release guard THEN invalidate — the refetch will see committed DB data
      resumeRealtime();
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}
