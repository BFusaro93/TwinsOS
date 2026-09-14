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

/**
 * Core (re)submission logic — flips the entity to pending, (re)computes the
 * approval_requests chain against the current grandTotalCents, and
 * auto-approves the dead-end cases (no flow, zero steps, all steps
 * skipped). Extracted from useSubmitForApproval's mutationFn so it can also
 * be called from PO/requisition line-item mutations: editing (or adding, or
 * removing) a line item on an already-submitted record must re-run this —
 * otherwise a total that crosses an approval threshold AFTER submission
 * keeps whatever approval_requests were computed against the OLD, smaller
 * total, silently bypassing the higher threshold's required approver.
 */
export async function submitEntityForApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { entityId, entityType, grandTotalCents }: SubmitForApprovalArgs
): Promise<{ entityType: ApprovalFlow["entityType"]; autoApproved: boolean }> {
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

      // No approval flow configured for this entity type at all — the
      // entity was already flipped to "pending" above, and with no flow
      // there's nothing that will ever move it forward. The DB guard
      // (guard_procurement_approval_status) computes bool_and() over zero
      // approval_requests rows, which is NULL, not true, so it can't
      // auto-resolve this either — auto-approve now instead of leaving it
      // stuck.
      if (!flow) {
        const { error: autoErr } = await supabase
          .from(cfg.table)
          .update({ [cfg.statusColumn]: "approved" })
          .eq("id", entityId);
        if (autoErr) throw autoErr;
        return { entityType, autoApproved: true };
      }

      const { data: orgUsers } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("org_id", orgId) as { data: { id: string; name: string; role: string }[] | null };

      // crm_estimate steps store a crm_roles.id (not a generic Role) — resolve the
      // people holding that role via their linked crm_employees.user_id.
      const { data: crmEmployees } = (entityType === "crm_estimate"
        ? await supabase
            .from("crm_employees")
            .select("user_id, crm_role_id, first_name, last_name")
            .eq("org_id", orgId)
            .is("deleted_at", null)
        : { data: null }) as { data: { user_id: string | null; crm_role_id: string; first_name: string; last_name: string }[] | null };

      // Steps already carrying a real 'approved' decision must survive
      // resubmission untouched — their decided_at/comment/approver_id is
      // audit history, and re-asking an approver to re-approve something
      // they already signed off on (just because a line item was edited)
      // is not the desired behavior. Only steps NOT in this set get a new
      // pending row below.
      const { data: existingApproved } = await supabase
        .from("approval_requests")
        .select("flow_step_id")
        .eq("entity_id", entityId)
        .eq("org_id", orgId)
        .eq("status", "approved") as { data: { flow_step_id: string | null }[] | null };
      const alreadyApprovedStepIds = new Set(
        (existingApproved ?? []).map((r) => r.flow_step_id).filter((id): id is string => !!id)
      );

      // Clear out only the unresolved rows — stale 'pending' requests (being
      // recomputed against the new total) and 'superseded' runner-ups from a
      // prior multi-approver step. 'approved' and 'rejected' rows are left
      // alone so their history is preserved.
      await supabase
        .from("approval_requests")
        .delete()
        .eq("entity_id", entityId)
        .eq("org_id", orgId)
        .in("status", ["pending", "superseded"]);

      type StepRow = { id: string; order: number; required_role: string; threshold_cents: number; assigned_user_id: string | null };
      const steps = ((flow as unknown as { approval_flow_steps?: StepRow[] }).approval_flow_steps ?? [])
        .sort((a, b) => a.order - b.order);

      // A flow row exists but has zero steps configured — same dead-end as no
      // flow at all (nothing will ever populate approval_requests for this
      // entity), so auto-approve here too instead of leaving it stuck pending.
      if (steps.length === 0) {
        const { error: autoErr } = await supabase
          .from(cfg.table)
          .update({ [cfg.statusColumn]: "approved" })
          .eq("id", entityId);
        if (autoErr) throw autoErr;
        return { entityType, autoApproved: true };
      }

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
        // Already satisfied by a preserved 'approved' row from before this
        // resubmission — don't re-ask, and don't insert a duplicate row.
        if (alreadyApprovedStepIds.has(step.id)) continue;

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

      // Every step that applies to this flow was already satisfied by a
      // preserved 'approved' row (the recompute produced zero new requests
      // because the whole chain was already signed off) — the entity was
      // unconditionally flipped to "pending" above, so it must be advanced
      // to "approved" now or it would be stuck forever with no outstanding
      // approval_requests row to ever move it.
      if (newRequests.length === 0 && steps.every((s) => alreadyApprovedStepIds.has(s.id))) {
        const { error: autoErr } = await supabase
          .from(cfg.table)
          .update({ [cfg.statusColumn]: "approved" })
          .eq("id", entityId);
        if (autoErr) throw autoErr;
        return { entityType, autoApproved: true };
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
      const now = new Date().toISOString();

      // Bug 4 — re-validate the deciding user is still an active approver
      // right before acting. Role/identity is snapshotted onto the
      // approval_requests row at submission time and never re-checked; if
      // the user was demoted or deactivated afterward, only
      // `approver_id = auth.uid()` + chain-order is checked server-side
      // (see 20260803042625_enforce_approval_chain_order.sql), which still
      // lets a deactivated user's stale row through. Block it here too.
      const { data: { user: actingUser } } = await supabase.auth.getUser();
      if (!actingUser) throw new Error("Not authenticated");
      const { data: actingProfile, error: actingProfileErr } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", actingUser.id)
        .single();
      if (actingProfileErr) throw actingProfileErr;
      if (actingProfile?.status !== "active") {
        throw new Error("Your account is no longer active, so you can't act on this approval. Contact an admin.");
      }

      // Fetch the request first so we know flow_step_id and entity_type
      const { data: decided, error: fetchErr } = await supabase
        .from("approval_requests")
        .select("flow_step_id, entity_id, entity_type")
        .eq("id", requestId)
        .single();
      if (fetchErr) throw fetchErr;

      // .select().single() (rather than a bare update) so an out-of-turn
      // attempt — blocked server-side by the only_approver_can_update RLS
      // policy's chain-order check — surfaces as a real error instead of a
      // silent no-op: RLS filters the row out of the update entirely, so
      // PostgREST returns zero rows and .single() throws.
      const { error: updateErr } = await supabase
        .from("approval_requests")
        .update({ status, comment: comment ?? null, decided_at: now })
        .eq("id", requestId)
        .select("id")
        .single();
      if (updateErr) {
        // PGRST116 = "no rows returned" from .single() — here that means RLS
        // filtered the row out of the update rather than a real DB error.
        if (updateErr.code === "PGRST116") {
          throw new Error("It's not your turn to approve this yet — an earlier step is still pending.");
        }
        throw updateErr;
      }

      const entityType = decided.entity_type as EntityType;
      const cfg = ENTITY_CONFIG[entityType];

      let newEntityStatus: string | undefined;
      let allResolved = false;

      if (status === "rejected") {
        // Bug 1 — a rejection anywhere in the chain must halt it immediately:
        // supersede every OTHER still-pending request for this entity, not
        // just the siblings of this same step (later-order steps must be
        // superseded too, otherwise they're still actionable and the RLS
        // chain-order guard only blocks on an earlier step being 'pending' —
        // a 'rejected' predecessor doesn't block anything). Then flip the
        // entity straight to 'rejected' right away instead of waiting for
        // every step group to resolve (which, for a rejection, they never
        // fully will since later steps are unrelated groups).
        await supabase
          .from("approval_requests")
          .update({ status: "superseded" })
          .eq("entity_id", decided.entity_id)
          .neq("id", requestId)
          .eq("status", "pending");

        newEntityStatus = "rejected";
        allResolved = true;

        const { error: entityErr } = await supabase
          .from(cfg.table)
          .update({ [cfg.statusColumn]: newEntityStatus })
          .eq("id", entityId)
          .select("id")
          .single();
        if (entityErr) throw entityErr;

        // Estimates have a Comments tab (same pattern as POs/WOs) — auto-post
        // the rejection reason there so it's visible in context, not just in
        // the (easy to miss) rejection email.
        if (entityType === "crm_estimate" && comment) {
          const { data: rejectorProfile } = await supabase
            .from("profiles")
            .select("org_id, name")
            .eq("id", actingUser.id)
            .single();
          if (rejectorProfile) {
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
      } else if (decided.flow_step_id) {
        // Approval: only the other pending approvers on THIS SAME step are
        // superseded (multi-approver step — first to decide wins).
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

      if (status !== "rejected") {
        // ── Check if all approval steps are now resolved ────────────────────
        // If so, update the entity status atomically here (not in a separate
        // mutation). Bug 2 — group by flow_step_id, but a request whose step
        // was deleted from the flow (flow_step_id nulled out, mapped to "" by
        // mapApprovalRequest) must NOT be bucketed together with every other
        // orphaned request: that would collapse two independently-required,
        // unrelated approvals into one group that looks resolved as soon as
        // ANY one of them is approved. Key orphans by their own row id instead.
        const stepGroups = new Map<string, typeof freshMapped>();
        for (const r of freshMapped) {
          const groupKey = r.flowStepId || `orphan-${r.id}`;
          if (!stepGroups.has(groupKey)) stepGroups.set(groupKey, []);
          stepGroups.get(groupKey)!.push(r);
        }

        allResolved =
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

        if (allResolved) {
          // With rejections handled in their own branch above, every group
          // resolving here means every group is either skipped or approved.
          newEntityStatus = "approved";

          const { error: entityErr } = await supabase
            .from(cfg.table)
            .update({ [cfg.statusColumn]: newEntityStatus })
            .eq("id", entityId)
            .select("id")
            .single();
          if (entityErr) throw entityErr;
        }
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
