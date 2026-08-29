"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fireAutomationTrigger } from "@/lib/automations/fire-trigger-client";
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
    salesRepName: row.sales_rep ? `${row.sales_rep.first_name ?? ""} ${row.sales_rep.last_name ?? ""}`.trim() || null : null,
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
        .select("*, clients(display_name, primary_email, primary_phone), sales_rep:crm_employees!crm_contracts_sales_rep_id_fkey(first_name,last_name)")
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
        .select("*, clients(display_name, primary_email, primary_phone), sales_rep:crm_employees!crm_contracts_sales_rep_id_fkey(first_name,last_name)")
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
        .select("*, clients(display_name, primary_email, primary_phone), sales_rep:crm_employees!crm_contracts_sales_rep_id_fkey(first_name,last_name)")
        .single();
      if (error) throw error;
      return mapContract(data);
    },
    onSuccess: (contract) => {
      qc.invalidateQueries({ queryKey: ["crm-contracts"] });
      fireAutomationTrigger({ triggerType: "contract_created", clientId: contract.clientId });
    },
  });
}

// Fields that change what the client actually agreed to when they signed —
// editing any of these on an already-signed contract must not leave the
// original signature/status silently attached to the new terms.
const CONTRACT_FINANCIAL_FIELDS = [
  "monthly_amount_cents",
  "monthly_amounts",
  "invoice_line_items",
  "start_date",
  "end_date",
  // Re-pointing a signed contract to a different client would otherwise let
  // the cron start billing that new client under the original client's
  // signature/consent with no new signature required.
  "client_id",
  // Both directly control when/which month the invoicing cron bills —
  // same class of "changes what was actually agreed to" as the amount/date
  // fields above.
  "billing_day_of_month",
  "bill_month_in_advance",
] as const;

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

      const touchesFinancials = CONTRACT_FINANCIAL_FIELDS.some((f) => f in updates);
      let finalUpdates = updates;
      if (touchesFinancials && !("status" in updates)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: current } = await (supabase as any)
          .from("crm_contracts")
          .select("status")
          .eq("id", id)
          .single();
        if (current?.status === "signed") {
          // Revert to "sent" and clear the signature — the daily
          // contract-invoices cron bills off these same fields, so a
          // signed contract's price/dates must never change without the
          // client re-agreeing to the new terms first.
          finalUpdates = { ...updates, status: "sent", signed_at: null, signed_by: null };
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contracts")
        .update(finalUpdates)
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
      const { data, error } = await (supabase as any)
        .from("crm_contracts")
        .update({
          status,
          ...(status === "signed"
            ? { signed_at: new Date().toISOString(), signed_by: signedBy ?? null }
            : {}),
        })
        .eq("id", id)
        .select("client_id")
        .single();
      if (error) throw error;
      return { clientId: data?.client_id as string | undefined, status };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["crm-contracts"] });
      if (data.status === "signed" && data.clientId) {
        fireAutomationTrigger({ triggerType: "contract_signed", clientId: data.clientId });
      }
    },
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
 * within the current calendar month) so it can't double-bill, and the same
 * status/start_date/end_date guard as the cron so an unsigned, cancelled,
 * expired, not-yet-started, or already-ended contract can't be billed either.
 */
export function useGenerateContractInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractIds: string[]): Promise<GenerateInvoicesResult[]> => {
      const supabase = createClient();
      const now = new Date();
      const todayDay = now.getDate();

      const results: GenerateInvoicesResult[] = [];

      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

      for (const contractId of contractIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: contract, error: fetchErr } = await (supabase as any)
          .from("crm_contracts")
          .select("id, org_id, client_id, title, status, start_date, end_date, monthly_amount_cents, monthly_amounts, invoice_line_items, sales_rep_id, bill_month_in_advance")
          .eq("id", contractId)
          .is("deleted_at", null)
          .single();
        if (fetchErr || !contract) {
          results.push({ contractId, status: "skipped", reason: "contract not found" });
          continue;
        }

        // Same guard as the daily cron (src/app/api/cron/contract-invoices):
        // a manual "Create Invoices" click must not be able to bill a
        // contract the client never signed, or one that's been cancelled/
        // expired, or one whose term hasn't started or has already ended.
        if (contract.status !== "signed" && contract.status !== "active") {
          results.push({ contractId, status: "skipped", reason: `contract is ${contract.status}, not signed/active` });
          continue;
        }
        if (contract.start_date && contract.start_date > todayStr) {
          results.push({ contractId, status: "skipped", reason: "contract hasn't started yet" });
          continue;
        }
        if (contract.end_date && contract.end_date < todayStr) {
          results.push({ contractId, status: "skipped", reason: "contract has ended" });
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
            balance_cents: monthAmount,
          })
          .select("id")
          .single();
        if (invErr || !invoice) {
          // 23505 = unique_violation on crm_invoices_one_per_contract_month —
          // a concurrent request (double-click, another tab, or the daily
          // cron) already inserted this month's invoice between our SELECT
          // check above and this INSERT; report it the same as the
          // pre-existing skip path rather than surfacing a raw DB error.
          const reason = invErr?.code === "23505" ? "already billed for this month" : (invErr?.message ?? "insert failed");
          results.push({ contractId, status: "skipped", reason });
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

// ── contract balance & visits summary ───────────────────────────────────────────

export interface ContractBalanceSummary {
  totalBilledCents: number;
  totalPaidCents: number;
  remainingBalanceCents: number;
  invoiceCount: number;
}

// Sums crm_invoices for this contract — those rows already carry
// total_cents/amount_paid_cents/balance_cents kept current by the invoice
// payment/status triggers (see use-invoices.ts), so this is a plain rollup,
// not a recompute. Void invoices are excluded — a voided invoice was never
// really billed, so it shouldn't count toward "billed" or "remaining."
export function useContractBalance(contractId?: string) {
  return useQuery({
    queryKey: ["crm-contracts", contractId, "balance"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .select("total_cents, amount_paid_cents, balance_cents")
        .eq("contract_id", contractId)
        .is("deleted_at", null)
        .neq("status", "void");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      return {
        totalBilledCents: rows.reduce((s, r) => s + (r.total_cents ?? 0), 0),
        totalPaidCents: rows.reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0),
        remainingBalanceCents: rows.reduce((s, r) => s + (r.balance_cents ?? 0), 0),
        invoiceCount: rows.length,
      } as ContractBalanceSummary;
    },
    enabled: !!contractId,
  });
}

export interface ContractVisitsSummary {
  totalVisits: number;
  remainingVisits: number;
  nextVisit: { id: string; scheduledDate: string } | null;
}

const VISIT_TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

// crm_job_visits has no contract_id of its own — it links to a contract only
// through job_id -> crm_jobs.contract_id (same two-hop path JobsUnderContractTab
// uses via useJobsByContract), so this joins through crm_jobs to filter.
export function useContractVisits(contractId?: string) {
  return useQuery({
    queryKey: ["crm-contracts", contractId, "visits"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_visits")
        .select("id, scheduled_date, status, crm_jobs!inner(contract_id)")
        .eq("crm_jobs.contract_id", contractId)
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as { id: string; scheduled_date: string; status: string }[];
      const upcoming = rows.filter((v) => !VISIT_TERMINAL_STATUSES.has(v.status));
      return {
        totalVisits: rows.length,
        remainingVisits: upcoming.length,
        nextVisit: upcoming[0] ? { id: upcoming[0].id, scheduledDate: upcoming[0].scheduled_date } : null,
      } as ContractVisitsSummary;
    },
    enabled: !!contractId,
  });
}

// ── contract included services (bundled visit caps) ──────────────────────────
// e.g. a seasonal maintenance contract that includes 25 lawn mowings — how
// many visits of a given service are bundled into the contract price, and
// how many have actually been used. Distinct from crm_job_services.qty
// (a per-job snapshot on the Jobs Under Contract tab, not a contract-level
// cap tracked against real completed visits).

export interface CRMContractService {
  id: string;
  orgId: string;
  contractId: string;
  serviceId: string | null;
  serviceName: string;
  visitsIncluded: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContractService(row: any): CRMContractService {
  return {
    id: row.id,
    orgId: row.org_id,
    contractId: row.contract_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    visitsIncluded: row.visits_included,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useContractServices(contractId?: string) {
  return useQuery({
    queryKey: ["crm-contracts", contractId, "services"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_contract_services")
        .select("*")
        .eq("contract_id", contractId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data.map(mapContractService)) as CRMContractService[];
    },
    enabled: !!contractId,
  });
}

export function useUpsertContractService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      contractId,
      serviceId,
      serviceName,
      visitsIncluded,
      sortOrder,
    }: {
      id?: string;
      contractId: string;
      serviceId: string | null;
      serviceName: string;
      visitsIncluded: number;
      sortOrder: number;
    }) => {
      const supabase = createClient();
      const row = {
        contract_id: contractId,
        service_id: serviceId,
        service_name: serviceName,
        visits_included: visitsIncluded,
        sort_order: sortOrder,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = id
        ? await (supabase as any).from("crm_contract_services").update(row).eq("id", id)
        : await (supabase as any).from("crm_contract_services").insert(row);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["crm-contracts", vars.contractId, "services"] }),
  });
}

export function useDeleteContractService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; contractId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_contract_services")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["crm-contracts", vars.contractId, "services"] }),
  });
}

/** Completed-visit count per crm_job_services row (id) across every job
 *  linked to this contract — used to compute "used / included" for each
 *  bundled service. Keyed by job_service_id rather than service name/id
 *  directly: a visit only counts here if it's actually linked
 *  (crm_job_visits.job_service_id) to the specific service line it was
 *  scheduled against, same linkage the Waiting List / package-visit
 *  scheduling already relies on. A visit with no job_service_id (e.g. an
 *  older single-service recurring job never split into per-service rows)
 *  isn't attributed to any one service here — undercounting is the safer
 *  failure mode for a usage cap than silently guessing which service it was. */
export function useContractServiceVisitCounts(contractId?: string) {
  return useQuery({
    queryKey: ["crm-contracts", contractId, "service-visit-counts"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_visits")
        .select("job_service_id, crm_jobs!inner(contract_id)")
        .eq("crm_jobs.contract_id", contractId)
        .eq("status", "completed")
        .is("deleted_at", null)
        .not("job_service_id", "is", null);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of (data ?? []) as { job_service_id: string }[]) {
        counts.set(row.job_service_id, (counts.get(row.job_service_id) ?? 0) + 1);
      }
      return counts;
    },
    enabled: !!contractId,
  });
}

/** Every crm_job_services row (id + service_id) across jobs linked to this
 *  contract — needed to resolve useContractServiceVisitCounts' per-row
 *  counts back to a service_id/name so they can be matched against this
 *  contract's bundled crm_contract_services entries. */
export function useContractJobServiceRows(contractId?: string) {
  return useQuery({
    queryKey: ["crm-contracts", contractId, "job-service-rows"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_services")
        .select("id, service_id, service_name, crm_jobs!inner(contract_id)")
        .eq("crm_jobs.contract_id", contractId);
      if (error) throw error;
      return (data ?? []) as { id: string; service_id: string | null; service_name: string }[];
    },
    enabled: !!contractId,
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
