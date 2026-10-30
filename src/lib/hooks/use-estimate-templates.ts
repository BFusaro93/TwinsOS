"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { EstimateTemplate, EstimateTemplateItem, EstimateTemplateItemSubitem } from "@/types/crm-estimates";
import { toDisplaySettings, type DisplaySettings } from "@/lib/estimate-display-settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubitem(row: any): EstimateTemplateItemSubitem {
  return {
    id: row.id,
    orgId: row.org_id,
    templateItemId: row.template_item_id,
    type: row.type,
    productId: row.product_id ?? null,
    serviceId: row.service_id ?? null,
    name: row.name,
    qty: Number(row.qty),
    rateCents: row.rate_cents,
    costCents: row.cost_cents,
    invoice: row.invoice ?? true,
    printOnInvoice: row.print_on_invoice ?? true,
    printOnEstimate: row.print_on_estimate ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplateItem(row: any): EstimateTemplateItem {
  return {
    id: row.id,
    orgId: row.org_id,
    templateId: row.template_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    calcType: row.calc_type,
    qty: Number(row.qty),
    unitType: row.unit_type ?? null,
    rateCents: row.rate_cents,
    visits: row.visits,
    budgetedHours: Number(row.budgeted_hours),
    sortOrder: row.sort_order,
    discountCents: row.discount_cents ?? 0,
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? null,
    appliedDiscountId: row.applied_discount_id ?? null,
    productionRateSqftPerHr: row.production_rate_sqft_per_hr ? Number(row.production_rate_sqft_per_hr) : null,
    budgetMethod: row.budget_method ?? "manual",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subitems: (row.estimate_template_item_subitems ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => !r.deleted_at)
      .map(mapSubitem)
      .sort((a: EstimateTemplateItemSubitem, b: EstimateTemplateItemSubitem) => a.sortOrder - b.sortOrder),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(row: any): EstimateTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    showDiscounts: row.show_discounts,
    showWhen: row.show_when,
    displaySettings: toDisplaySettings(row.display_settings),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    items: (row.estimate_template_items ?? []).map(mapTemplateItem),
  };
}

export function useEstimateTemplates() {
  return useQuery({
    queryKey: ["estimate-templates"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_templates")
        .select("*, estimate_template_items(*, estimate_template_item_subitems(*))")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapTemplate)) as EstimateTemplate[];
    },
  });
}

export function useCreateEstimateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      showDiscounts?: boolean;
      showWhen?: string;
      displaySettings?: DisplaySettings;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_templates")
        .insert({
          name: values.name,
          show_discounts: values.showDiscounts ?? false,
          show_when: values.showWhen ?? "estimates",
          ...(values.displaySettings ? { display_settings: values.displaySettings } : {}),
        })
        .select()
        .single();
      if (error) throw error;
      return mapTemplate(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

export function useUpdateEstimateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patch: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_templates")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

export function useDeleteEstimateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

export function useUpsertTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      item,
    }: {
      templateId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item: Record<string, any>;
    }) => {
      const supabase = createClient();
      // A blind .upsert() with a partial payload (e.g. just a discount patch on
      // an existing row) fails NOT NULL validation on columns like service_name
      // that aren't in the patch — Postgres checks the INSERT side of
      // "INSERT ... ON CONFLICT DO UPDATE" regardless of whether the conflict
      // branch fires. Existing rows must go through a real UPDATE instead
      // (mirrors useUpsertLineItem in use-estimates.ts).
      if (item.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { id, ...patch } = item;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("estimate_template_items")
          .update(patch)
          .eq("id", id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("estimate_template_items")
          .insert({ template_id: templateId, ...item });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

export function useDeleteTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_template_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

export interface TemplateSubitemInput {
  id?: string;
  type: "product" | "subservice";
  productId: string | null;
  serviceId: string | null;
  name: string;
  qty: number;
  rateCents: number;
  costCents: number;
  invoice?: boolean;
  printOnInvoice?: boolean;
  printOnEstimate?: boolean;
  sortOrder?: number;
}

export function useUpsertTemplateSubitem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateItemId, item }: { templateItemId: string; item: TemplateSubitemInput }) => {
      const supabase = createClient();
      const row = {
        template_item_id: templateItemId,
        type: item.type,
        product_id: item.productId,
        service_id: item.serviceId,
        name: item.name,
        qty: item.qty,
        rate_cents: item.rateCents,
        cost_cents: item.costCents,
        invoice: item.invoice ?? true,
        print_on_invoice: item.printOnInvoice ?? true,
        print_on_estimate: item.printOnEstimate ?? true,
        sort_order: item.sortOrder ?? 0,
      };
      // Existing rows go through a real UPDATE (partial patches would trip
      // NOT NULL checks on the INSERT side of an upsert).
      if (item.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("estimate_template_item_subitems")
          .update(row)
          .eq("id", item.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("estimate_template_item_subitems").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

export function useDeleteTemplateSubitem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_template_item_subitems")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate-templates"] }),
  });
}

/**
 * Copies a bundle item's sub-items onto a freshly created estimate line.
 * Callers must run recalcEstimateTotals(estimateId) afterwards (sub-item
 * dollars count toward the estimate subtotal). Estimates only: jobs have no
 * sub-item concept.
 */
export async function copyTemplateSubitemsToLine(
  lineItemId: string,
  subitems: EstimateTemplateItemSubitem[] | undefined,
): Promise<void> {
  if (!lineItemId || !subitems?.length) return;
  const supabase = createClient();
  const rows = subitems.map((s, idx) => ({
    line_item_id: lineItemId,
    type: s.type,
    product_id: s.productId,
    service_id: s.serviceId,
    name: s.name,
    qty: s.qty,
    rate_cents: s.rateCents,
    cost_cents: s.costCents,
    total_cents: Math.round(s.qty * s.rateCents),
    invoice: s.invoice,
    print_on_invoice: s.printOnInvoice,
    print_on_estimate: s.printOnEstimate,
    sort_order: idx,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("estimate_line_item_subitems").insert(rows);
  if (error) throw error;
}
