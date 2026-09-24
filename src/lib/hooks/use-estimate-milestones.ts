"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapInvoice } from "@/lib/hooks/use-invoices";
import type { EstimateMilestone } from "@/types/crm-estimates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMilestone(row: any): EstimateMilestone {
  return {
    id: row.id,
    orgId: row.org_id,
    estimateId: row.estimate_id ?? null,
    projectId: row.project_id ?? null,
    name: row.name,
    milestoneType: row.milestone_type,
    milestoneValue: row.milestone_value,
    amountCents: row.amount_cents,
    sortOrder: row.sort_order,
    targetDate: row.target_date ?? null,
    status: row.status,
    invoiceId: row.invoice_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A milestone can be reached from two query scopes (its estimate and its
// project), and a converted one lives in both at once. Every mutation must
// refresh both or the surface you weren't looking at goes stale.
function invalidateMilestoneScopes(
  qc: ReturnType<typeof useQueryClient>,
  vars: { estimateId?: string | null; projectId?: string | null },
) {
  if (vars.estimateId) qc.invalidateQueries({ queryKey: ["estimate-milestones", vars.estimateId] });
  if (vars.projectId) qc.invalidateQueries({ queryKey: ["project-milestones", vars.projectId] });
}

export function useEstimateMilestones(estimateId: string) {
  return useQuery({
    queryKey: ["estimate-milestones", estimateId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("estimate_milestones")
        .select("*")
        .eq("estimate_id", estimateId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data.map(mapMilestone)) as EstimateMilestone[];
    },
    enabled: !!estimateId,
  });
}

/**
 * The billing schedule for a project. Same rows as useEstimateMilestones --
 * a milestone converted from an estimate carries both ids, so invoicing it
 * here marks it invoiced on the estimate too. There is one schedule, not a
 * copy per surface.
 */
export function useProjectMilestones(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-milestones", projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("estimate_milestones")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data.map(mapMilestone)) as EstimateMilestone[];
    },
    enabled: !!projectId,
  });
}

export function useCreateEstimateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      /** At least one of estimateId / projectId is required by a DB CHECK. */
      estimateId?: string | null;
      projectId?: string | null;
      name: string;
      milestoneType: "flat" | "percent";
      milestoneValue: number;
      amountCents: number;
      sortOrder: number;
      targetDate?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("estimate_milestones")
        .insert({
          estimate_id: values.estimateId ?? null,
          project_id: values.projectId ?? null,
          name: values.name,
          milestone_type: values.milestoneType,
          milestone_value: values.milestoneValue,
          amount_cents: values.amountCents,
          sort_order: values.sortOrder,
          target_date: values.targetDate ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapMilestone(data);
    },
    onSuccess: (_d, vars) => invalidateMilestoneScopes(qc, vars),
  });
}

export function useUpdateEstimateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      estimateId,
      projectId,
      patch,
    }: {
      id: string;
      estimateId?: string | null;
      projectId?: string | null;
      patch: Partial<{
        name: string;
        milestoneType: "flat" | "percent";
        milestoneValue: number;
        amountCents: number;
        sortOrder: number;
        targetDate: string | null;
      }>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.milestoneType !== undefined) row.milestone_type = patch.milestoneType;
      if (patch.milestoneValue !== undefined) row.milestone_value = patch.milestoneValue;
      if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
      if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
      if (patch.targetDate !== undefined) row.target_date = patch.targetDate;
      const { error } = await supabase.from("estimate_milestones").update(row).eq("id", id);
      if (error) throw error;
      return { id, estimateId, projectId };
    },
    onSuccess: (_d, vars) => invalidateMilestoneScopes(qc, vars),
  });
}

export function useDeleteEstimateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; estimateId?: string | null; projectId?: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("estimate_milestones")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateMilestoneScopes(qc, vars),
  });
}

/** Creates a real invoice for a single milestone's amount and marks it invoiced. */
export function useCreateInvoiceFromMilestone() {
  const qc = useQueryClient();
  return useMutation({
    // estimateId/projectId aren't used to build the call — the RPC resolves
    // both from the milestone row itself — but they're what onSuccess
    // invalidates, so callers still pass them.
    mutationFn: async ({
      milestone,
      clientId,
      salesRepId,
      poNumber,
    }: {
      milestone: EstimateMilestone;
      estimateId?: string | null;
      projectId?: string | null;
      clientId: string;
      salesRepId?: string | null;
      poNumber?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;

      // Locks the milestone row and checks it isn't already 'invoiced' before
      // creating anything — a double-click or a second tab would otherwise
      // both read "not yet invoiced" and each create a full duplicate
      // invoice for the same milestone (see the migration's own comment).
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_invoice_from_milestone", {
        p_milestone_id: milestone.id,
        p_client_id: clientId,
        p_sales_rep_id: salesRepId ?? null,
        p_po_number: poNumber ?? null,
      });
      if (rpcErr) throw rpcErr;
      const invoiceId = rpcResult?.[0]?.invoice_id as string | undefined;
      if (!invoiceId) throw new Error("Failed to create invoice from milestone");

      const { data: inv, error: invErr } = await supabase
        .from("crm_invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (invErr) throw invErr;

      return mapInvoice(inv);
    },
    onSuccess: (_d, vars) => {
      invalidateMilestoneScopes(qc, vars);
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
    },
  });
}
