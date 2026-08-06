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
    salesRepId: row.sales_rep_id ?? null,
    lastBilledDate: row.last_billed_date ?? null,
    monthlyAmounts: (row.monthly_amounts as MonthlyAmounts) ?? {},
    invoiceLineItems: (row.invoice_line_items as string[]) ?? [],
    defaultService: row.default_service ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
    clientEmail: row.clients?.primary_email ?? null,
    clientPhone: row.clients?.primary_phone ?? null,
    salesRepName: row.profiles?.name ?? null,
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
        .select("*, clients(display_name, primary_email, primary_phone), profiles!crm_contracts_sales_rep_id_fkey(name)")
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
        .select("*, clients(display_name, primary_email, primary_phone), profiles!crm_contracts_sales_rep_id_fkey(name)")
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
      salesRepId?: string;
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
          sales_rep_id: values.salesRepId ?? null,
          monthly_amounts: values.monthlyAmounts ?? {},
          invoice_line_items: values.invoiceLineItems ?? [],
          default_service: values.defaultService ?? null,
          status: "draft",
        })
        .select("*, clients(display_name, primary_email, primary_phone), profiles!crm_contracts_sales_rep_id_fkey(name)")
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

const MONTH_KEYS: (keyof MonthlyAmounts)[] = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

export interface GenerateInvoicesResult {
  contractId: string;
  status: "created" | "skipped";
  reason?: string;
}

/**
 * Manually generates this month's invoice for the given contracts — the
 * "Create Invoices" action. Unlike the daily cron (/api/cron/contract-invoices)
 * this ignores billing_day_of_month/is_active/auto_generate, since a manual
 * click is an explicit request to bill now. It still enforces the same
 * idempotency check (skip if this contract already has an invoice dated
 * within the current calendar month) so it can't double-bill.
 */
export function useGenerateContractInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractIds: string[]): Promise<GenerateInvoicesResult[]> => {
      const supabase = createClient();
      const now = new Date();
      const todayDay = now.getDate();

      const results: GenerateInvoicesResult[] = [];

      for (const contractId of contractIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: contract, error: fetchErr } = await (supabase as any)
          .from("crm_contracts")
          .select("id, org_id, client_id, title, monthly_amount_cents, monthly_amounts, invoice_line_items, sales_rep_id, bill_month_in_advance")
          .eq("id", contractId)
          .is("deleted_at", null)
          .single();
        if (fetchErr || !contract) {
          results.push({ contractId, status: "skipped", reason: "contract not found" });
          continue;
        }

        // "Bill month in advance" labels/dates this invoice for next
        // calendar month instead of the current one — same shift as the
        // daily cron (src/app/api/cron/contract-invoices/route.ts) applies,
        // so a manual "Create Invoices" click behaves consistently with it.
        const billingMonthDate = contract.bill_month_in_advance
          ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
          : new Date(now.getFullYear(), now.getMonth(), 1);
        const billingMonthLastDay = new Date(billingMonthDate.getFullYear(), billingMonthDate.getMonth() + 1, 0).getDate();
        const billingDay = Math.min(todayDay, billingMonthLastDay);
        const billingMonthKey = MONTH_KEYS[billingMonthDate.getMonth()];
        const invoiceDateStr = `${billingMonthDate.getFullYear()}-${String(billingMonthDate.getMonth() + 1).padStart(2, "0")}-${String(billingDay).padStart(2, "0")}`;
        const monthStart = `${billingMonthDate.getFullYear()}-${String(billingMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
        const monthEnd = `${billingMonthDate.getFullYear()}-${String(billingMonthDate.getMonth() + 1).padStart(2, "0")}-${String(billingMonthLastDay).padStart(2, "0")}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("crm_invoices")
          .select("id")
          .eq("client_id", contract.client_id)
          .eq("contract_id", contract.id)
          .gte("invoice_date", monthStart)
          .lte("invoice_date", monthEnd)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (existing) {
          results.push({ contractId, status: "skipped", reason: "already billed for this month" });
          continue;
        }

        const monthlyAmounts = (contract.monthly_amounts ?? {}) as Record<string, number>;
        const monthAmount: number =
          monthlyAmounts[billingMonthKey] != null
            ? monthlyAmounts[billingMonthKey]
            : contract.monthly_amount_cents;
        if (monthAmount <= 0) {
          results.push({ contractId, status: "skipped", reason: "zero amount for month" });
          continue;
        }

        const lineItems = (contract.invoice_line_items ?? []) as string[];
        const description = lineItems.length > 0 ? lineItems.join("\n") : contract.title;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoice, error: invErr } = await (supabase as any)
          .from("crm_invoices")
          .insert({
            client_id: contract.client_id,
            contract_id: contract.id,
            sales_rep_id: contract.sales_rep_id ?? null,
            description,
            invoice_date: invoiceDateStr,
            status: "draft",
            subtotal_cents: monthAmount,
            total_cents: monthAmount,
          })
          .select("id")
          .single();
        if (invErr || !invoice) {
          results.push({ contractId, status: "skipped", reason: invErr?.message ?? "insert failed" });
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: numErr } = await (supabase.rpc as any)("assign_invoice_number", { p_invoice_id: invoice.id });

        // Line item description AND name (the "Service" column) should reflect
        // the contract's actual configured service(s), not the contract's own
        // title — description matches the invoice header description above.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: liErr } = await (supabase as any).from("crm_invoice_line_items").insert({
          invoice_id: invoice.id,
          name: lineItems.length > 0 ? lineItems.join(", ") : contract.title,
          description,
          qty: 1,
          rate_cents: monthAmount,
          total_cents: monthAmount,
          sort_order: 1,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("crm_contracts")
          .update({ last_billed_date: invoiceDateStr })
          .eq("id", contractId);

        const problems = [
          numErr ? `invoice number not assigned (${numErr.message})` : null,
          liErr ? `line item not created (${liErr.message})` : null,
        ].filter(Boolean);
        results.push({ contractId, status: "created", reason: problems.length > 0 ? problems.join("; ") : undefined });
      }

      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contracts"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
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
