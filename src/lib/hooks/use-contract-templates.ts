"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { MonthlyAmounts } from "@/types/crm-invoices";

export interface ContractTemplate {
  id: string;
  name: string;
  title: string;
  defaultService: string | null;
  invoiceLineItems: string[];
  monthlyAmounts: MonthlyAmounts;
  billingDayOfMonth: number;
  billMonthInAdvance: boolean;
  paymentType: string | null;
  autoGenerate: boolean;
  includeSubProperties: boolean;
}

export type ContractTemplateInput = Omit<ContractTemplate, "id">;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(row: any): ContractTemplate {
  return {
    id: row.id,
    name: row.name,
    title: row.title ?? "",
    defaultService: row.default_service ?? null,
    invoiceLineItems: (row.invoice_line_items as string[]) ?? [],
    monthlyAmounts: (row.monthly_amounts as MonthlyAmounts) ?? {},
    billingDayOfMonth: row.billing_day_of_month ?? 1,
    billMonthInAdvance: row.bill_month_in_advance ?? false,
    paymentType: row.payment_type ?? null,
    autoGenerate: row.auto_generate ?? true,
    includeSubProperties: row.include_sub_properties ?? true,
  };
}

export function useContractTemplates() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["crm-contract-templates"],
    queryFn: async (): Promise<ContractTemplate[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_contract_templates")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).map(mapTemplate);
    },
  });
}

export function useSaveContractTemplate() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: ContractTemplateInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_contract_templates").insert({
        name: t.name,
        title: t.title,
        default_service: t.defaultService,
        invoice_line_items: t.invoiceLineItems,
        monthly_amounts: t.monthlyAmounts,
        billing_day_of_month: t.billingDayOfMonth,
        bill_month_in_advance: t.billMonthInAdvance,
        payment_type: t.paymentType,
        auto_generate: t.autoGenerate,
        include_sub_properties: t.includeSubProperties,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contract-templates"] }),
  });
}

export function useDeleteContractTemplate() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contract_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contract-templates"] }),
  });
}
