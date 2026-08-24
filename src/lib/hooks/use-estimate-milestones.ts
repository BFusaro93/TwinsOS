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
      const { data: { user } } = await supabase.auth.getUser();
      const todayStr = new Date().toISOString().slice(0, 10);

      const { data: inv, error: invErr } = await supabase
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          estimate_id: estimateId,
          sales_rep_id: salesRepId ?? null,
          description: milestone.name,
          invoice_date: todayStr,
          po_number: poNumber ?? null,
          subtotal_cents: milestone.amountCents,
          total_cents: milestone.amountCents,
          balance_cents: milestone.amountCents,
          status: "draft",
        })
        .select()
        .single();
      if (invErr) throw invErr;

      const { error: liErr } = await supabase.from("crm_invoice_line_items").insert({
        invoice_id: inv.id,
        name: milestone.name,
        description: "",
        qty: 1,
        rate_cents: milestone.amountCents,
        total_cents: milestone.amountCents,
        sort_order: 0,
      });
      if (liErr) throw liErr;

      const { error: msErr } = await supabase
        .from("estimate_milestones")
        .update({ status: "invoiced", invoice_id: inv.id })
        .eq("id", milestone.id);
      if (msErr) throw msErr;

      return mapInvoice(inv);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["estimate-milestones", vars.estimateId] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}
