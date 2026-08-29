"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapInvoice } from "@/lib/hooks/use-invoices";
import type { EstimateMilestone } from "@/types/crm-estimates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMilestone(row: any): EstimateMilestone {
  return {
    id: row.id,
    orgId: row.org_id,
    estimateId: row.estimate_id,
    name: row.name,
    milestoneType: row.milestone_type,
    milestoneValue: row.milestone_value,
    amountCents: row.amount_cents,
    sortOrder: row.sort_order,
    status: row.status,
    invoiceId: row.invoice_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export function useCreateEstimateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      estimateId: string;
      name: string;
      milestoneType: "flat" | "percent";
      milestoneValue: number;
      amountCents: number;
      sortOrder: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("estimate_milestones")
        .insert({
          estimate_id: values.estimateId,
          name: values.name,
          milestone_type: values.milestoneType,
          milestone_value: values.milestoneValue,
          amount_cents: values.amountCents,
          sort_order: values.sortOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return mapMilestone(data);
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["estimate-milestones", vars.estimateId] }),
  });
}

export function useUpdateEstimateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      estimateId,
      patch,
    }: {
      id: string;
      estimateId: string;
      patch: Partial<{
        name: string;
        milestoneType: "flat" | "percent";
        milestoneValue: number;
        amountCents: number;
        sortOrder: number;
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
      const { error } = await supabase.from("estimate_milestones").update(row).eq("id", id);
      if (error) throw error;
      return { id, estimateId };
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["estimate-milestones", vars.estimateId] }),
  });
}

export function useDeleteEstimateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; estimateId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("estimate_milestones")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["estimate-milestones", vars.estimateId] }),
  });
}

/** Creates a real invoice for a single milestone's amount and marks it invoiced. */
export function useCreateInvoiceFromMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestone,
      estimateId,
      clientId,
      salesRepId,
      poNumber,
    }: {
      milestone: EstimateMilestone;
      estimateId: string;
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
      qc.invalidateQueries({ queryKey: ["estimate-milestones", vars.estimateId] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}
