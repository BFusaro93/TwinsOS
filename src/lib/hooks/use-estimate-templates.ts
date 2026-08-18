"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { EstimateTemplate, EstimateTemplateItem } from "@/types/crm-estimates";
import { toDisplaySettings, type DisplaySettings } from "@/lib/estimate-display-settings";

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
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(row: any): EstimateTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    estDocument: row.est_document,
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
        .select("*, estimate_template_items(*)")
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
      estDocument?: string;
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
          est_document: values.estDocument ?? "Estimate - General",
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_template_items")
        .upsert({ template_id: templateId, ...item });
      if (error) throw error;
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
