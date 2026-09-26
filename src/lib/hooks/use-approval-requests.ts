import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
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
  queryKeys: string[][];
  /** Optimistic cache patch — omitted for entity types with no dedicated list cache
   *  to patch; those just rely on the queryKeys invalidation on settle. */
  patchCache?: (queryClient: ReturnType<typeof useQueryClient>, entityId: string, status: string) => void;
}

const ENTITY_CONFIG: Record<EntityType, EntityConfig> = {
  requisition: {
    queryKeys: [["requisitions"]],
    patchCache: (qc, id, status) => patchReqCache(qc, id, { status: status as Requisition["status"] }),
  },
  purchase_order: {
    queryKeys: [["purchase-orders"]],
    patchCache: (qc, id, status) => patchPOCache(qc, id, { status: status as PurchaseOrder["status"] }),
  },
  crm_estimate: {
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
        // Rows from earlier (rejected) cycles are archived by the RPC.
        .eq("archived", false)
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

/**
 * Core (re)submission logic — the submit_for_approval RPC flips the entity to
 * pending, (re)computes the approval_requests chain against the entity's
 * CURRENT stored total, and auto-approves the dead-end cases (no flow, zero
 * steps, every step skipped or already approved). It runs server-side because
 * approval_requests is not writable by non-admins (see
 * 20260926180000_approval_engine_server_side.sql). Also called from
 * PO/requisition mutations: editing an already-submitted record must re-run
 * this, otherwise a total that crosses a threshold AFTER submission keeps the
 * approvers computed against the OLD, smaller total.
 *
 * grandTotalCents is accepted for call-site compatibility but ignored — the
 * RPC reads the total from the row so a client can't under-report it.
 */
export async function submitEntityForApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { entityId, entityType }: SubmitForApprovalArgs
): Promise<{ entityType: ApprovalFlow["entityType"]; autoApproved: boolean }> {
  const { data, error } = await supabase.rpc("submit_for_approval", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw new Error(error.message);
  const autoApproved = !!(data as { auto_approved?: boolean } | null)?.auto_approved;

  if (!autoApproved) {
    // Fire approval notification emails (best-effort — don't block on failure)
    fetch("/api/approval-requests/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, entityType }),
    }).catch(() => {
      // Non-fatal — the approval request was created; email is best-effort
    });
  }

  return { entityType, autoApproved };
}

export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: SubmitForApprovalArgs) => {
      const supabase = createClient();
      return submitEntityForApproval(supabase, args);
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

      // decide_approval re-checks everything server-side: the caller is still
      // active, is this step's approver (or an admin/manager), it's their turn
      // in the chain, and the record is still awaiting approval. It also
      // supersedes the other rows and moves the entity, which a non-admin
      // approver can't do directly under RLS.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("decide_approval", {
        p_request_id: requestId,
        p_status: status,
        p_comment: comment ?? null,
      });
      if (error) throw new Error(error.message);
      const result = data as { entity_type: EntityType; entity_id: string; new_entity_status: string | null };
      const entityType = result.entity_type;
      const newEntityStatus = result.new_entity_status ?? undefined;
      const allResolved = !!newEntityStatus;

      // Estimates have a Comments tab (same pattern as POs/WOs) — auto-post
      // the rejection reason there so it's visible in context, not just in
      // the (easy to miss) rejection email.
      if (status === "rejected" && entityType === "crm_estimate" && comment) {
        const { data: { user: actingUser } } = await supabase.auth.getUser();
        const { data: rejectorProfile } = actingUser
          ? await supabase.from("profiles").select("org_id, name").eq("id", actingUser.id).single()
          : { data: null };
        if (actingUser && rejectorProfile) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("comments").insert({
            org_id: rejectorProfile.org_id,
            created_by: actingUser.id,
            author_id: actingUser.id,
            record_type: "crm_estimate",
            record_id: entityId,
            author_name: rejectorProfile.name ?? "Approver",
            body: `Rejected: ${comment}`,
          });
        }
      }

      const { data: fresh, error: freshErr } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("entity_id", entityId)
        .eq("archived", false)
        .order("order", { ascending: true });
      if (freshErr) throw freshErr;
      const freshMapped = fresh.map(mapApprovalRequest);

      return { freshMapped, allResolved, entityType, newEntityStatus };
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
    onSuccess: ({ freshMapped, allResolved, entityType, newEntityStatus }, variables) => {
      // Patch approval-requests cache with fresh server data
      if (freshMapped) {
        queryClient.setQueryData(["approval-requests", entityId], freshMapped);
      }
      // Patch entity cache so UI reflects the new status immediately
      if (allResolved && newEntityStatus) {
        const cfg = ENTITY_CONFIG[entityType as EntityType];
        cfg.patchCache?.(queryClient, entityId, newEntityStatus);
        // Fire approved/rejected email to the submitter (best-effort) — the
        // comment is the rejection reason the approver just typed, so the
        // submitter sees it in the email instead of only in the app.
        const emailType = newEntityStatus === "approved" ? "approved" : "rejected";
        fetch("/api/notifications/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: emailType, entityId, entityType,
            extra: emailType === "rejected" && variables.comment ? { comment: variables.comment } : {},
          }),
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
      queryClient.invalidateQueries({ queryKey: ["comments", "crm_estimate", entityId] });
    },
  });
}
