"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ProjectChangeOrder,
  ChangeOrderEditableStatus,
  ChangeOrderTreatment,
} from "@/types/project";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChangeOrder(row: any): ProjectChangeOrder {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    coNumber: row.co_number,
    title: row.title ?? "",
    description: row.description ?? "",
    amountCents: row.amount_cents ?? 0,
    costImpactCents: row.cost_impact_cents ?? 0,
    status: row.status,
    billingTreatment: row.billing_treatment,
    requestedDate: row.requested_date,
    approvedAt: row.approved_at ?? null,
    approvedBy: row.approved_by ?? null,
    clientReference: row.client_reference ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as ProjectChangeOrder;
}

export function useChangeOrders(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("project_change_orders")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("co_number", { ascending: true });
      if (error) throw error;
      return data.map(mapChangeOrder) as ProjectChangeOrder[];
    },
    enabled: !!projectId,
  });
}

/**
 * Anything that changes a change order also changes the project's derived
 * contract price, its EAC, and the pending milestone schedule — so every
 * mutation here has to refresh all four or a surface goes stale.
 */
function invalidateProjectBilling(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  qc.invalidateQueries({ queryKey: ["change-orders", projectId] });
  qc.invalidateQueries({ queryKey: ["project-milestones", projectId] });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["client-projects"] });
}

export function useCreateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      projectId: string;
      title: string;
      description?: string;
      amountCents: number;
      costImpactCents?: number;
      billingTreatment: ChangeOrderTreatment;
      requestedDate?: string;
      clientReference?: string | null;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // co_number is assigned by a DB trigger under a lock on the project —
      // computing max()+1 here is the race that duplicated WO/PO numbers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("project_change_orders")
        .insert({
          project_id: values.projectId,
          title: values.title,
          description: values.description ?? "",
          amount_cents: values.amountCents,
          cost_impact_cents: values.costImpactCents ?? 0,
          billing_treatment: values.billingTreatment,
          ...(values.requestedDate ? { requested_date: values.requestedDate } : {}),
          client_reference: values.clientReference ?? null,
          status: "draft",
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapChangeOrder(data);
    },
    onSuccess: (_d, vars) => invalidateProjectBilling(qc, vars.projectId),
  });
}

export function useUpdateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      projectId: string;
      patch: Partial<{
        title: string;
        description: string;
        amountCents: number;
        costImpactCents: number;
        billingTreatment: ChangeOrderTreatment;
        status: ChangeOrderEditableStatus;
        requestedDate: string;
        clientReference: string | null;
      }>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
      if (patch.costImpactCents !== undefined) row.cost_impact_cents = patch.costImpactCents;
      if (patch.billingTreatment !== undefined) row.billing_treatment = patch.billingTreatment;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.requestedDate !== undefined) row.requested_date = patch.requestedDate;
      if (patch.clientReference !== undefined) row.client_reference = patch.clientReference;
      const { error } = await supabase.from("project_change_orders").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateProjectBilling(qc, vars.projectId),
  });
}

/**
 * Soft-deletes a change order that was never approved. An APPROVED one has to
 * go through useReverseChangeOrder instead: deleting it only drops the derived
 * contract price and leaves the milestones billing the raised amount, which
 * over-bills the client by the whole change order. The database refuses it
 * either way; this is here so the caller picks the right one.
 */
export function useDeleteChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("project_change_orders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateProjectBilling(qc, vars.projectId),
  });
}

/**
 * Reverses an approved change order. The RPC subtracts exactly what the
 * approval added — it recorded the per-milestone split in billing_allocation —
 * so the contract price and the schedule come back down together.
 *
 * It refuses when an affected milestone has already been invoiced, because
 * that part of the change order is money the client has been billed; the
 * invoice has to be voided or credited first. The error says so, so surface
 * its message rather than a generic one.
 */
export function useReverseChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase.rpc("reverse_change_order", {
        p_change_order_id: id,
        p_delete: true,
      });
      // PostgrestError is a plain object, not an Error — rethrow as one so the
      // tab's toast shows the RPC's reason ("removes $30,000.00, but only
      // $28,500.00 is still unbilled…") instead of a generic failure.
      if (error) throw new Error(error.message);
      return (data?.[0]?.new_contract_cents ?? 0) as number;
    },
    onSuccess: (_d, vars) => invalidateProjectBilling(qc, vars.projectId),
  });
}

/**
 * Approves a change order. The RPC does the whole thing atomically: flips the
 * status, moves the project's EAC, recomputes the derived contract price and
 * reshapes the pending milestones — half of that applied would leave a
 * contract that disagrees with its own billing schedule.
 */
export function useApproveChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      treatment,
    }: {
      id: string;
      projectId: string;
      /** Overrides the treatment stored on the change order. */
      treatment?: ChangeOrderTreatment | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase.rpc("approve_change_order", {
        p_change_order_id: id,
        p_treatment: treatment ?? null,
      });
      // PostgrestError is a plain object, not an Error — rethrow as one so the
      // tab's toast shows the RPC's reason ("removes $30,000.00, but only
      // $28,500.00 is still unbilled…") instead of a generic failure.
      if (error) throw new Error(error.message);
      return (data?.[0]?.new_contract_cents ?? 0) as number;
    },
    onSuccess: (_d, vars) => invalidateProjectBilling(qc, vars.projectId),
  });
}
