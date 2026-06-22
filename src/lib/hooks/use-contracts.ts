"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  CRMContract,
  CRMContractNote,
  BillingFrequency,
  ContractStatus,
  MonthlyAmounts,
} from "@/types/crm-invoices";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContract(row: any): CRMContract {
  return {
    id: row.id,
    orgId: row.org_id,
    clientId: row.client_id,
    estimateId: row.estimate_id,
    title: row.title,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyAmountCents: row.monthly_amount_cents,
    billingFrequency: row.billing_frequency,
    autoRenew: row.auto_renew ?? false,
    notes: row.notes,
    signedAt: row.signed_at,
    signedBy: row.signed_by,
    billingDayOfMonth: row.billing_day_of_month ?? 1,
    billMonthInAdvance: row.bill_month_in_advance ?? false,
    paymentType: row.payment_type ?? null,
    poNumber: row.po_number ?? null,
    autoGenerate: row.auto_generate ?? true,
    isActive: row.is_active ?? true,
    includeSubProperties: row.include_sub_properties ?? true,
    source: row.source ?? null,
    salesRep: row.sales_rep ?? null,
    lastBilledDate: row.last_billed_date ?? null,
    monthlyAmounts: (row.monthly_amounts as MonthlyAmounts) ?? {},
    invoiceLineItems: (row.invoice_line_items as string[]) ?? [],
    defaultService: row.default_service ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNote(row: any): CRMContractNote {
  return {
    id: row.id,
    orgId: row.org_id,
    contractId: row.contract_id,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function useContracts(clientId?: string, activeOnly?: boolean) {
  return useQuery({
    queryKey: ["crm-contracts", clientId ?? "all", activeOnly ?? "any"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_contracts")
        .select("*, clients(display_name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      if (activeOnly === true) q = q.eq("is_active", true);
      if (activeOnly === false) q = q.eq("is_active", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data.map(mapContract)) as CRMContract[];
    },
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: ["crm-contracts", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_contracts")
        .select("*, clients(display_name)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapContract(data);
    },
    enabled: !!id,
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      clientId: string;
      title: string;
      estimateId?: string;
      startDate?: string;
      endDate?: string;
      monthlyAmountCents?: number;
      billingFrequency?: BillingFrequency;
      billingDayOfMonth?: number;
      billMonthInAdvance?: boolean;
      paymentType?: string;
      poNumber?: string;
      autoGenerate?: boolean;
      isActive?: boolean;
      includeSubProperties?: boolean;
      source?: string;
      salesRep?: string;
      monthlyAmounts?: MonthlyAmounts;
      invoiceLineItems?: string[];
      defaultService?: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_contracts")
        .insert({
          client_id: values.clientId,
          title: values.title,
          estimate_id: values.estimateId ?? null,
          start_date: values.startDate ?? null,
          end_date: values.endDate ?? null,
          monthly_amount_cents: values.monthlyAmountCents ?? 0,
          billing_frequency: values.billingFrequency ?? "monthly",
          billing_day_of_month: values.billingDayOfMonth ?? 1,
          bill_month_in_advance: values.billMonthInAdvance ?? false,
          payment_type: values.paymentType ?? null,
          po_number: values.poNumber ?? null,
          auto_generate: values.autoGenerate ?? true,
          is_active: values.isActive ?? true,
          include_sub_properties: values.includeSubProperties ?? true,
          source: values.source ?? null,
          sales_rep: values.salesRep ?? null,
          monthly_amounts: values.monthlyAmounts ?? {},
          invoice_line_items: values.invoiceLineItems ?? [],
          default_service: values.defaultService ?? null,
          status: "draft",
        })
        .select("*, clients(display_name)")
        .single();
      if (error) throw error;
      return mapContract(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contracts"] }),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updates: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contracts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["crm-contracts"] });
      qc.invalidateQueries({ queryKey: ["crm-contracts", id] });
    },
  });
}

export function useUpdateContractStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      signedBy,
    }: {
      id: string;
      status: ContractStatus;
      signedBy?: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contracts")
        .update({
          status,
          ...(status === "signed"
            ? { signed_at: new Date().toISOString(), signed_by: signedBy ?? null }
            : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contracts"] }),
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contracts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contracts"] }),
  });
}

// ── contract notes ────────────────────────────────────────────────────────────

export function useContractNotes(contractId: string) {
  return useQuery({
    queryKey: ["crm-contract-notes", contractId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_contract_notes")
        .select("*")
        .eq("contract_id", contractId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data.map(mapNote)) as CRMContractNote[];
    },
    enabled: !!contractId,
  });
}

export function useCreateContractNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, body }: { contractId: string; body: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_contract_notes")
        .insert({ contract_id: contractId, body })
        .select()
        .single();
      if (error) throw error;
      return mapNote(data);
    },
    onSuccess: (_d, { contractId }) => {
      qc.invalidateQueries({ queryKey: ["crm-contract-notes", contractId] });
    },
  });
}

export function useDeleteContractNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contractId }: { id: string; contractId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contract_notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return contractId;
    },
    onSuccess: (_d, { contractId }) => {
      qc.invalidateQueries({ queryKey: ["crm-contract-notes", contractId] });
    },
  });
}
