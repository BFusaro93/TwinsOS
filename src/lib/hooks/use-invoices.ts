"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { computeInvoiceTotals } from "@/lib/invoices/totals";
import { fireAutomationTrigger } from "@/lib/automations/fire-trigger-client";
import { fireQuickBooksInvoiceSync, fireQuickBooksInvoiceUpdate, fireQuickBooksPaymentSync } from "@/lib/integrations/quickbooks-client";
import type { CRMInvoice, InvoiceLineItem, CRMPayment } from "@/types/crm-invoices";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import type { BulkImportResult } from "@/lib/csv";
import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import {
  createInvoiceFromJob,
  findLiveInvoiceCoveringJob,
  findLiveInvoiceForVisit,
  invoiceBlockReason,
  type InvoiceFromJobInput,
} from "@/lib/invoices/create-from-job";
import { invalidateClientBalances } from "@/lib/hooks/client-balance-invalidation";
import { fireStaleIntentCancel } from "@/lib/stripe/stale-intents-client";

// ── locked-invoice error handling ───────────────────────────────────────────────

// The crm_invoices / crm_invoice_line_items triggers added in
// 20260901130000_crm_invoice_lock_server_enforcement.sql raise a plain
// Postgres exception when a financial column or line item is written while
// the invoice is locked. Postgrest surfaces that RAISE EXCEPTION message
// verbatim as error.message, so detect it here and re-throw a normalized
// Error — callers that only show `err.message` (or a generic toast) get a
// clear, user-facing reason instead of depending on the raw driver text.
const LOCKED_INVOICE_MESSAGE = "This invoice is locked and cannot be edited. Unlock it first.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throwIfLockedInvoiceError(error: any): never {
  const message: string = error?.message ?? "";
  if (message.toLowerCase().includes("locked and cannot be edited")) {
    throw new Error(LOCKED_INVOICE_MESSAGE);
  }
  throw error;
}

// ── void eligibility ──────────────────────────────────────────────────────────

// Voiding an invoice that already has payments applied would orphan those
// payment allocations (the money stays recorded against a record that no
// longer counts toward AR). It is blocked in three places so no path can slip
// through: the UI disables the action, these hooks re-check server-truth
// before the UPDATE, and a DB trigger
// (20260907210000_crm_invoice_void_guards.sql) rejects it outright.
export function voidBlockedMessage(amountPaidCents: number): string {
  return `Refund or unapply the ${formatCents(amountPaidCents)} in payments before voiding this invoice.`;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Reads the invoice's current locked / amount_paid state straight from the DB
 * and throws a user-facing Error when it must not be voided. Runs before the
 * UPDATE so the caller's `catch` can show a real reason instead of a silent
 * no-op.
 */
async function assertVoidable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
): Promise<{ clientId: string | null }> {
  const { data, error } = await supabase
    .from("crm_invoices")
    .select("client_id, status, locked, amount_paid_cents")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Invoice not found.");
  if (data.status === "void") throw new Error("This invoice is already void.");
  // `locked` deliberately does NOT block voiding. The lock guards the invoice's
  // AMOUNTS (see crm_invoice_block_locked_financial_update, which only covers
  // subtotal/discount/tax/total) and is set the moment an invoice is sent or
  // printed — voiding an issued-but-unpaid invoice is the normal way to cancel
  // one, so requiring unlock-then-void would gate the most common case.
  const paid = Number(data.amount_paid_cents ?? 0);
  if (paid > 0) throw new Error(voidBlockedMessage(paid));
  return { clientId: data.client_id ?? null };
}

/**
 * Sends the materials a voided invoice billed back to pending (and restores
 * their stock), exactly as deleting a draft does — otherwise they stay
 * 'invoiced' against a dead invoice and never bill again. Runs AFTER the void
 * itself succeeded (a trigger can still reject the void after assertVoidable's
 * pre-check; resetting first would free the materials on an invoice that is
 * still live — the delete bug). The invoice's lines are kept for the audit
 * trail; the visit tag on a dead line is released when the visit re-invoices
 * (complete-visit-side-effects).
 */
async function releaseMaterialsForVoidedInvoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  invoiceId: string,
) {
  const { data: lines, error } = await supabase
    .from("crm_invoice_line_items")
    .select("id")
    .eq("invoice_id", invoiceId);
  if (error) throw error;
  try {
    await resetJobProductsForLines(supabase, ((lines ?? []) as { id: string }[]).map((l) => l.id));
  } catch (e) {
    throw new Error(
      `The invoice was voided, but its materials could not be released back to pending: ${e instanceof Error ? e.message : "unknown error"}. Set them to pending on the job.`,
    );
  }
}

/**
 * The DB-side void guards raise plain Postgres exceptions; Postgrest surfaces
 * the RAISE message verbatim. Re-throw them as-is (they are already written
 * for a user) rather than letting a raw driver error reach a generic toast.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throwIfVoidGuardError(error: any): never {
  const message: string = error?.message ?? "";
  if (message.toLowerCase().includes("cannot be voided")) {
    throw new Error(message);
  }
  throw error;
}

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineItem(row: any): InvoiceLineItem {
  return {
    id: row.id,
    orgId: row.org_id,
    invoiceId: row.invoice_id,
    name: row.name ?? null,
    description: row.description,
    qty: Number(row.qty),
    rateCents: row.rate_cents,
    totalCents: row.total_cents,
    discountCents: row.discount_cents ?? 0,
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? null,
    appliedDiscountId: row.applied_discount_id ?? null,
    isTaxable: row.is_taxable ?? false,
    sortOrder: row.sort_order,
    serviceDate: row.service_date ?? null,
    hours: row.hours != null ? Number(row.hours) : null,
    men: row.men ?? null,
    visitId: row.visit_id ?? null,
    serviceId: row.service_id ?? null,
    serviceName: row.crm_services?.name ?? null,
    isOtherCharge: !!row.is_other_charge,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPayment(row: any): CRMPayment {
  return {
    id: row.id,
    orgId: row.org_id,
    invoiceId: row.invoice_id,
    clientId: row.client_id,
    amountCents: row.amount_cents,
    unusedAmountCents: row.unused_amount_cents ?? 0,
    refundedAmountCents: row.refunded_amount_cents ?? 0,
    processingFeeCents: row.processing_fee_cents ?? 0,
    paymentDate: row.payment_date,
    method: row.method,
    reference: row.reference,
    memo: row.memo ?? null,
    notes: row.notes,
    isPrepayment: row.is_prepayment ?? false,
    isCredit: row.is_credit ?? false,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    // Only populated when the query joins `clients` (e.g. useInvoice()'s
    // Payment History embed) — used to detect and label a cross-account
    // payment (recorded against a parent client_id) shown on a child
    // sub-account's invoice.
    clientName: row.clients?.display_name ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapInvoice(row: any): CRMInvoice {
  return {
    id: row.id,
    orgId: row.org_id,
    invoiceNumber: row.invoice_number,
    clientId: row.client_id,
    estimateId: row.estimate_id,
    crmJobId: row.crm_job_id,
    contractId: row.contract_id ?? null,
    billingFrequency: (Array.isArray(row.crm_contracts) ? row.crm_contracts[0] : row.crm_contracts)?.billing_frequency ?? null,
    projectId: row.project_id ?? null,
    salesRepId: row.sales_rep_id ?? null,
    saleType: row.sale_type ?? null,
    description: row.description,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    poNumber: row.po_number,
    terms: row.terms ?? null,
    serviceAddress: row.service_address ?? null,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? null,
    appliedDiscountId: row.applied_discount_id ?? null,
    taxRateBps: row.tax_rate_bps,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    amountPaidCents: row.amount_paid_cents,
    balanceCents: row.balance_cents,
    notes: row.notes,
    locked: row.locked ?? false,
    lockedAt: row.locked_at ?? null,
    preferredPaymentMethod: row.preferred_payment_method ?? null,
    pdfTemplateId: row.pdf_template_id ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
    // Billing Email, when set, is where an invoice goes (see the Billing tab copy).
    clientEmail: row.clients?.billing_email?.trim() || row.clients?.primary_email || null,
    clientAddress: row.clients
      ? [row.clients.billing_address, row.clients.billing_city, row.clients.billing_state, row.clients.billing_zip]
          .filter(Boolean).join(", ")
      : null,
    clientDefaultTaxRateBps: row.clients?.default_tax_rate_bps ?? 0,
    clientIsTaxable: row.clients?.is_taxable !== false,
    clientDefaultTerms: row.clients?.default_terms ?? "due_on_receipt",
    clientDefaultPaymentMethod: row.clients?.default_payment_method ?? null,
    clientSavedPaymentMethodType: row.clients?.saved_payment_method_type ?? null,
    clientSavedPaymentMethodSummary: row.clients?.saved_payment_method_summary ?? null,
    clientAutopayEnabled: row.clients?.autopay_enabled ?? true,
    clientBalanceOutstandingCents: row.clients?.balance_outstanding_cents ?? null,
    clientPrepayCents: row.clients?.balance_prepay_cents ?? null,
    clientCreditsCents: row.clients?.balance_credits_cents ?? null,
    pendingPaymentCents: row.pending_payment_cents ?? null,
    pendingPaymentMethod: row.pending_payment_method ?? null,
    pendingPaymentAt: row.pending_payment_at ?? null,
    openDisputePaymentId: row.open_dispute_payment_id ?? null,
    salesRepName: row.sales_rep ? `${row.sales_rep.first_name ?? ""} ${row.sales_rep.last_name ?? ""}`.trim() || null : null,
    clientInvoiceDelivery: row.clients?.invoice_delivery ?? "email",
    lineItems: (row.crm_invoice_line_items ?? []).map(mapLineItem),
    payments: (row.crm_payments ?? []).map(mapPayment),
  };
}

// ── queries ───────────────────────────────────────────────────────────────────

// `clientId` also accepts an array — used by the payment invoice-picker to
// pull open invoices for a parent client AND its child sub-accounts in one
// query (a property-manager parent can record one payment allocated across
// several sub-accounts' invoices).
/**
 * Invoices, optionally narrowed. `projectId` is a genuine filter, not a hint:
 * pass it and you get only that project's invoices, never the rest of the
 * client's unrelated billing. Passing `projectId: null` explicitly (rather
 * than undefined) yields nothing, which is what a project with no link should
 * show -- see the Projects Billing tab.
 */
export function useInvoices(
  clientId?: string | string[],
  opts?: { projectId?: string | null },
) {
  const clientIds = Array.isArray(clientId) ? clientId : clientId ? [clientId] : [];
  const projectId = opts?.projectId;
  const projectKey = projectId === undefined ? "any" : projectId ?? "none";
  return useQuery({
    queryKey: ["crm-invoices", clientIds.length > 0 ? [...clientIds].sort() : "all", { projectId: projectKey }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_invoices")
        .select("*, clients(display_name, billing_address, billing_city, billing_state, billing_zip, invoice_delivery, default_payment_method, balance_outstanding_cents, balance_prepay_cents, balance_credits_cents, saved_payment_method_type, saved_payment_method_summary, autopay_enabled), sales_rep:crm_employees!crm_invoices_sales_rep_id_fkey(first_name,last_name), crm_contracts(billing_frequency), crm_invoice_line_items(id, name, description, total_cents, discount_cents, is_taxable, service_id, sort_order, is_other_charge, crm_services(name))")
        .is("deleted_at", null)
        // `invoice_date` is a DATE, so batch-generated invoices tie in droves.
        // Without a tiebreaker Postgres returns tied rows in physical heap
        // order, which changes whenever one of them is UPDATEd — so the same
        // query returned the same invoices in a DIFFERENT order after any
        // edit, and the list visibly reshuffled on refetch (F-10). Order by
        // invoice_number as well so the sequence is stable across fetches.
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false });
      if (clientIds.length === 1) q = q.eq("client_id", clientIds[0]);
      else if (clientIds.length > 1) q = q.in("client_id", clientIds);
      if (projectId) q = q.eq("project_id", projectId);
      // PostgREST caps a plain select at 1000 rows — page through so a large
      // org's oldest invoices don't silently drop off the list.
      const pageSize = 1000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
      return rows.map(mapInvoice) as CRMInvoice[];
    },
    // An explicit null project means "this project can't own invoices yet" --
    // don't fetch the client's whole ledger just to throw it away.
    enabled: projectId !== null,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ["crm-invoices", "detail", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .select("*, clients(display_name, primary_email, billing_email, billing_address, billing_city, billing_state, billing_zip, default_tax_rate_bps, default_terms, default_payment_method, saved_payment_method_type, saved_payment_method_summary, autopay_enabled, is_taxable), sales_rep:crm_employees!crm_invoices_sales_rep_id_fkey(first_name,last_name), crm_invoice_line_items(*), crm_payments!crm_payments_invoice_id_fkey(*, clients(display_name))")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      const invoice = mapInvoice(data);

      // A payment split across multiple invoices stores crm_payments.invoice_id
      // = null and records its exact per-invoice share in
      // crm_payment_allocations instead — the FK-based crm_payments(*) embed
      // above only ever matches a payment applied to exactly one invoice, so
      // a split payment silently never showed up in Payment History on
      // either invoice it was actually applied to. Fetch this invoice's
      // allocation rows (joined back to the full payment) and merge in any
      // payment not already present via the direct FK match, displaying the
      // ALLOCATED amount rather than the payment's full amount.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allocRows, error: allocErr } = await (supabase as any)
        .from("crm_payment_allocations")
        .select("amount_cents, crm_payments(*, clients(display_name))")
        .eq("invoice_id", id);
      if (allocErr) throw allocErr;

      // A payment matched by the FK can still be split: it was applied here
      // and part of it later went to another invoice (e.g. unused credit
      // applied elsewhere). Show this invoice's allocated share, not the full
      // check amount — otherwise the history over-counts (a $2,000 check
      // listed in full on an invoice it only paid $1,874.13 of).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allocatedByPaymentId = new Map<string, number>((allocRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => row.crm_payments)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => [row.crm_payments.id as string, row.amount_cents as number]));
      invoice.payments = (invoice.payments ?? []).map((p) => {
        const share = allocatedByPaymentId.get(p.id);
        return share !== undefined && share !== p.amountCents
          ? { ...p, displayAmountCents: share, isSplitAllocation: true }
          : p;
      });

      const existingPaymentIds = new Set((invoice.payments ?? []).map((p) => p.id));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allocatedPayments: CRMPayment[] = (allocRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => row.crm_payments && !existingPaymentIds.has(row.crm_payments.id))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => ({
          ...mapPayment(row.crm_payments),
          displayAmountCents: row.amount_cents,
          isSplitAllocation: true,
        }));

      if (allocatedPayments.length > 0) {
        invoice.payments = [...(invoice.payments ?? []), ...allocatedPayments].sort(
          (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
        );
      }

      return invoice;
    },
    enabled: !!id,
  });
}

// ── terms for a hand-created invoice ──────────────────────────────────────────

/**
 * Terms + due date for an invoice a person creates (from a job, an estimate, or
 * blank). Every server-side creator resolves these from the client's default
 * terms, else the org's — but these three inserts wrote neither, so the column
 * default ("due_on_receipt") won and due_date stayed null: a Net-30 client's
 * invoice was due on receipt, and the invoice-past-due automation (which skips
 * a null due_date) never fired for it. An explicit due date from the caller
 * still wins.
 */
async function resolveNewInvoiceTerms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientDefaultTerms: string | null | undefined,
  invoiceDate: string,
  explicitDueDate?: string | null
): Promise<{ terms: string; due_date: string | null; orgTaxRateBps: number }> {
  // Scoped to the caller's (effective) org: an unscoped maybeSingle() errors as
  // soon as RLS exposes more than one organizations row (staff impersonation),
  // and the terms silently fell back to due-on-receipt.
  const { data: orgId } = await supabase.rpc("my_org_id");
  const { data: orgRow } = orgId
    ? await supabase.from("organizations").select("default_billing_terms, tax_rate_percent").eq("id", orgId).maybeSingle()
    : { data: null };
  const terms = resolveInvoiceTerms(clientDefaultTerms, orgRow?.default_billing_terms);
  return {
    terms,
    due_date: explicitDueDate || computeDueDate(invoiceDate, terms),
    orgTaxRateBps: Math.round(Number(orgRow?.tax_rate_percent ?? 0) * 100),
  };
}

// ── create from estimate ──────────────────────────────────────────────────────

export function useCreateInvoiceFromEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      estimateId,
      clientId,
      salesRepId,
      description,
      invoiceDate,
      dueDate,
      poNumber,
      lineItems,
      subtotalCents,
      discountCents,
      discountType,
      discountValue,
      taxRateBps,
      taxCents,
      totalCents,
    }: {
      estimateId: string;
      clientId: string;
      salesRepId?: string | null;
      description: string;
      invoiceDate: string;
      dueDate?: string;
      poNumber?: string | null;
      lineItems: {
        name?: string | null; serviceId?: string | null; description: string; qty: number; rateCents: number; totalCents: number;
        discountCents?: number; discountType?: "percent" | "flat" | null; discountValue?: number | null;
        isTaxable?: boolean;
      }[];
      subtotalCents: number;
      // The estimate's header discount. Previously not passed at all, so the
      // invoice was born with discount_cents = 0 while total_cents already had
      // the discount taken off it. The first recalc (deleting a line, or any
      // financial edit) recomputed total as subtotal - 0 + tax and silently
      // added the discount back onto what the client owed.
      discountCents?: number;
      discountType?: "percent" | "flat" | null;
      discountValue?: number | null;
      taxRateBps: number;
      taxCents: number;
      totalCents: number;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Duplicate guard: an estimate that already has a live invoice, or has
      // been converted to a job (which bills through its own invoices), must not
      // be invoiced a second time — a retry after a partial failure, or a second
      // click, would otherwise double-bill the client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingInvoices, error: existingInvErr } = await (supabase as any)
        .from("crm_invoices")
        .select("invoice_number")
        .eq("estimate_id", estimateId)
        .is("deleted_at", null)
        .neq("status", "void")
        .limit(1);
      if (existingInvErr) throw existingInvErr;
      if (existingInvoices?.length) {
        throw new Error(`Invoice #${existingInvoices[0].invoice_number} already exists for this estimate`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingJobs, error: existingJobErr } = await (supabase as any)
        .from("crm_jobs")
        .select("id")
        .eq("estimate_id", estimateId)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .limit(1);
      if (existingJobErr) throw existingJobErr;
      if (existingJobs?.length) {
        throw new Error("This estimate has already been converted to a job — invoice from the job instead");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: client } = await (supabase as any)
        .from("clients")
        .select("default_payment_method, default_terms")
        .eq("id", clientId)
        .single();
      const newTerms = await resolveNewInvoiceTerms(supabase, client?.default_terms, invoiceDate, dueDate);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inv, error: invErr } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          estimate_id: estimateId,
          sales_rep_id: salesRepId ?? null,
          description,
          invoice_date: invoiceDate,
          terms: newTerms.terms,
          due_date: newTerms.due_date,
          po_number: poNumber ?? null,
          subtotal_cents: subtotalCents,
          discount_cents: discountCents ?? 0,
          discount_type: discountType ?? null,
          discount_value: discountValue ?? null,
          tax_rate_bps: taxRateBps,
          tax_cents: taxCents,
          total_cents: totalCents,
          balance_cents: totalCents,
          status: "draft",
          preferred_payment_method: client?.default_payment_method ?? null,
        })
        .select()
        .single();
      if (invErr) throw invErr;

      if (lineItems.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: liErr } = await (supabase as any).from("crm_invoice_line_items").insert(
          lineItems.map((li, i) => ({
            invoice_id: inv.id,
            service_id: li.serviceId ?? null,
            name: li.name ?? null,
            description: li.description,
            qty: li.qty,
            rate_cents: li.rateCents,
            total_cents: li.totalCents,
            discount_cents: li.discountCents ?? 0,
            discount_type: li.discountType ?? null,
            discount_value: li.discountValue ?? null,
            // crm_invoice_line_items.is_taxable defaults to false and, unlike
            // crm_job_services, has no trigger to fill it in. Leaving it unset
            // made every invoice-from-estimate untaxable, so the first recalc
            // wiped the tax the client had been quoted.
            is_taxable: li.isTaxable ?? false,
            sort_order: i,
          }))
        );
        if (liErr) {
          // Header and lines are two writes: don't leave a header whose lines
          // never landed (it would show as a real invoice and block a retry via
          // the duplicate guard above). Soft delete, per the no-hard-delete rule.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("crm_invoices")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", inv.id);
          throw liErr;
        }
      }

      return mapInvoice(inv);
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      fireAutomationTrigger({ triggerType: "invoice_created", clientId: invoice.clientId, invoiceId: invoice.id });
    },
  });
}

// ── create blank ──────────────────────────────────────────────────────────────

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      clientId: string;
      salesRepId?: string | null;
      description: string;
      invoiceDate: string;
      dueDate?: string;
      /** Bills this invoice against a Projects row (milestone / progress billing). */
      projectId?: string | null;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: client } = await (supabase as any)
        .from("clients")
        .select("default_payment_method, default_terms, default_tax_rate_bps, is_taxable")
        .eq("id", values.clientId)
        .single();
      const newTerms = await resolveNewInvoiceTerms(supabase, client?.default_terms, values.invoiceDate, values.dueDate);
      // The rate is decided once, here, and stored: a tax-exempt client is never
      // taxed, else the client's own default, else the company default. The
      // editor used to apply this chain on every open of a 0% invoice, so an
      // invoice deliberately set to no tax was re-taxed on its next Save.
      const taxRateBps = client?.is_taxable === false
        ? 0
        : (client?.default_tax_rate_bps ?? 0) > 0
          ? client.default_tax_rate_bps
          : newTerms.orgTaxRateBps;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: values.clientId,
          project_id: values.projectId ?? null,
          sales_rep_id: values.salesRepId ?? null,
          description: values.description,
          invoice_date: values.invoiceDate,
          terms: newTerms.terms,
          due_date: newTerms.due_date,
          status: "draft",
          invoice_number: null, // number assigned explicitly on save, not on open
          preferred_payment_method: client?.default_payment_method ?? null,
          tax_rate_bps: taxRateBps,
        })
        .select()
        .single();
      if (error) throw error;
      return mapInvoice(data);
    },
    onSuccess: (invoice, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
      fireAutomationTrigger({ triggerType: "invoice_created", clientId: vars.clientId, invoiceId: invoice.id });
    },
  });
}

// Statuses an import may set directly — everything before a payment exists.
const IMPORTABLE_INVOICE_STATUSES = new Set(["draft", "printed", "sent", "viewed"]);

/** "$1,250.00" / "1250" / "" → integer cents (0 when blank or unparseable). */
export function parseCsvMoneyCents(raw: string | null | undefined): number {
  const cleaned = (raw ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * "2026-03-04" / "3/4/2026" / "03/04/26" → "YYYY-MM-DD", or null when it isn't
 * a real calendar date. Slash dates are read US-style (M/D/Y), matching how the
 * exports this app and QuickBooks/Excel produce them.
 */
export function normalizeCsvDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (us) { m = +us[1]; d = +us[2]; y = +us[3] < 100 ? 2000 + +us[3] : +us[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function useBulkImportInvoices() {
  // Imported rows without a date mean "today" on the ORG's calendar, not
  // the importer's laptop or the UTC server.
  const orgTimeZone = useOrgTimeZone();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Paged: a bare select stops at PostgREST's 1000-row cap, so past 1000
      // clients rows silently failed to match (or missed a duplicate name).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clients = await fetchAllRows<any>(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("clients")
          .select("id, display_name, default_payment_method, default_terms")
          .is("deleted_at", null)
          .order("id")
      );
      // Two clients sharing a display name can't be told apart by the CSV's
      // clientName column — flag those rows instead of picking one at random.
      const byName = new Map<string, string>();
      const ambiguousNames = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (clients ?? []) as any[]) {
        const key = String(c.display_name).trim().toLowerCase();
        if (byName.has(key)) ambiguousNames.add(key);
        else byName.set(key, c.id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaultPaymentMethodById = new Map((clients ?? []).map((c: any) => [c.id, c.default_payment_method ?? null]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaultTermsById = new Map((clients ?? []).map((c: any) => [c.id, c.default_terms ?? null]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgTermsRow } = await (supabase as any)
        .from("organizations")
        .select("default_billing_terms")
        .maybeSingle();

      // Every invoice line bills a catalog service; the CSV's "service" column
      // must name one (matched case-insensitively).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: serviceRows } = await (supabase as any)
        .from("crm_services")
        .select("id, name")
        .is("deleted_at", null);
      const serviceByName = new Map<string, string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((serviceRows ?? []) as any[]).map((s) => [String(s.name).trim().toLowerCase(), s.id as string]),
      );

      // Re-running an import (after an error, a closed tab, or by mistake) must
      // not duplicate invoices. A row matches a live invoice of the same client
      // with the same date, total and description — or, when the file has an
      // invoiceNumber column, the same number and total. Each existing invoice
      // absorbs at most ONE row, so a file that legitimately holds two
      // identical invoices still imports the second the first time round.
      const existingInvoices = await fetchAllRows<{
        id: string; client_id: string; invoice_date: string; total_cents: number; description: string | null; invoice_number: number | null;
      }>(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("crm_invoices")
          .select("id, client_id, invoice_date, total_cents, description, invoice_number")
          .is("deleted_at", null)
          .order("id")
      );
      const dupKey = (clientId: string, date: string, totalCents: number, description: string) =>
        `${clientId}|${date}|${totalCents}|${description.trim().toLowerCase().replace(/\s+/g, " ")}`;
      const existingByKey = new Map<string, string[]>();
      const existingByNumber = new Map<string, { id: string; totalCents: number }>();
      for (const inv of existingInvoices) {
        const k = dupKey(inv.client_id, inv.invoice_date, inv.total_cents, inv.description ?? "");
        existingByKey.set(k, [...(existingByKey.get(k) ?? []), inv.id]);
        if (inv.invoice_number != null) existingByNumber.set(`${inv.client_id}|${inv.invoice_number}`, { id: inv.id, totalCents: inv.total_cents });
      }
      const matchedExisting = new Set<string>();

      let created = 0;
      const failed: BulkImportResult["failed"] = [];
      const skipped: BulkImportResult["failed"] = [];
      // Imported, but adjusted (e.g. a paid status brought in as sent).
      const warnings: BulkImportResult["failed"] = [];

      for (const [idx, r] of rows.entries()) {
        // The CSV's own line number (line 1 is the header), like every other importer.
        const rowNo = idx + 2;
        const serviceId = serviceByName.get((r.service ?? "").trim().toLowerCase());
        if (!serviceId) {
          failed.push({ row: rowNo, error: `service "${(r.service ?? "").trim()}" is not in your service catalog — not imported` });
          continue;
        }
        const nameKey = r.clientName?.trim().toLowerCase() ?? "";
        if (ambiguousNames.has(nameKey)) {
          failed.push({ row: rowNo, error: `more than one client is named "${r.clientName?.trim()}" — not imported` });
          continue;
        }
        const clientId = byName.get(nameKey);
        // "amount" is the subtotal (net of line discounts), "discount" the
        // invoice-level discount, "taxAmount" the tax — same columns the
        // export writes. parseCsvMoneyCents strips "$" and thousands
        // separators: parseFloat("1,250.00") is 1, not 1250.
        const amountCents = parseCsvMoneyCents(r.amount);
        if (!clientId) {
          failed.push({ row: rowNo, error: `client "${r.clientName?.trim() ?? ""}" not found — not imported` });
          continue;
        }
        if (!r.description?.trim()) {
          failed.push({ row: rowNo, error: "description is missing — not imported" });
          continue;
        }
        if (!amountCents) {
          failed.push({ row: rowNo, error: `amount "${r.amount?.trim() ?? ""}" is missing or not a number — not imported` });
          continue;
        }

        const discountCents = Math.max(0, parseCsvMoneyCents(r.discount));
        const taxCents = Math.max(0, parseCsvMoneyCents(r.taxAmount));
        const totalCents = amountCents - discountCents + taxCents;
        // Every recalc re-derives tax as round(taxable base × tax_rate_bps),
        // taxable base = taxable lines − invoice discount. Storing the tax with
        // rate 0 on a non-taxable line silently zeroed it on the first edit, so
        // derive the rate from the imported figures and mark the line taxable.
        const taxableBase = amountCents - discountCents;
        const taxRateBps = taxCents > 0 && taxableBase > 0 ? Math.round((taxCents / taxableBase) * 10000) : 0;

        // Imports carry no payment records, so an imported "paid"/"partial"
        // invoice would have amount_paid 0 and a full balance — its status and
        // balance permanently disagree (and it never shows as owed). Only
        // pre-payment statuses are imported as-is; paid/partial/overdue come
        // in as "sent" with a warning so the payment can be recorded against
        // it (which moves the status correctly).
        const rawStatus = r.status?.trim().toLowerCase() || "draft";
        let status: string;
        if (IMPORTABLE_INVOICE_STATUSES.has(rawStatus)) {
          status = rawStatus;
        } else if (rawStatus === "paid" || rawStatus === "partial" || rawStatus === "overdue") {
          status = "sent";
          warnings.push({ row: rowNo, error: `status "${rawStatus}" imported as "sent" — record the payment to update it` });
        } else {
          status = "draft";
          warnings.push({ row: rowNo, error: `unrecognized status "${r.status?.trim()}" imported as "draft"` });
        }

        // A negative amount (or a discount past the amount) would violate the
        // total_cents >= 0 constraint; report the row rather than aborting the
        // rest of the import part-way.
        if (totalCents < 0) {
          failed.push({ row: rowNo, error: "total is negative (discount exceeds amount) — not imported" });
          continue;
        }

        // Normalize (M/D/YYYY -> ISO) and validate before anything is inserted,
        // so a bad date is a reported row, not a mid-batch crash.
        const invoiceDate = r.invoiceDate?.trim() ? normalizeCsvDate(r.invoiceDate) : todayInZone(orgTimeZone);
        const importedDueDate = r.dueDate?.trim() ? normalizeCsvDate(r.dueDate) : null;
        if (!invoiceDate || (r.dueDate?.trim() && !importedDueDate)) {
          failed.push({ row: rowNo, error: `date "${(!invoiceDate ? r.invoiceDate : r.dueDate)?.trim()}" is not a valid date (use YYYY-MM-DD or M/D/YYYY) — not imported` });
          continue;
        }

        // Already imported (a retry, or a re-import of an export)?
        const csvNumber = r.invoiceNumber?.trim() ? parseInt(r.invoiceNumber.replace(/^#/, "").trim(), 10) : NaN;
        const byNumber = Number.isFinite(csvNumber) ? existingByNumber.get(`${clientId}|${csvNumber}`) : undefined;
        const sameNumber = byNumber && byNumber.totalCents === totalCents && !matchedExisting.has(byNumber.id) ? byNumber.id : null;
        const sameDetails = (existingByKey.get(dupKey(clientId, invoiceDate, totalCents, r.description)) ?? []).find((id) => !matchedExisting.has(id));
        const duplicateOf = sameNumber ?? sameDetails ?? null;
        if (duplicateOf) {
          matchedExisting.add(duplicateOf);
          skipped.push({
            row: rowNo,
            error: sameNumber
              ? `invoice #${csvNumber} for "${r.clientName?.trim()}" already exists — skipped`
              : `an invoice for "${r.clientName?.trim()}" on ${invoiceDate} with this description and total already exists — skipped`,
          });
          continue;
        }
        // A blank due date derives from the client's/org's terms — a null
        // due_date is skipped by the invoice-past-due automation forever.
        const invoiceTerms = resolveInvoiceTerms(defaultTermsById.get(clientId) as string | null, orgTermsRow?.default_billing_terms);
        const dueDate = importedDueDate || computeDueDate(invoiceDate, invoiceTerms);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoice, error } = await (supabase as any)
          .from("crm_invoices")
          .insert({
            created_by: user?.id ?? null,
            client_id: clientId,
            description: r.description.trim(),
            invoice_date: invoiceDate,
            due_date: dueDate,
            po_number: r.poNumber?.trim() || null,
            status,
            subtotal_cents: amountCents,
            discount_cents: discountCents,
            tax_rate_bps: taxRateBps,
            tax_cents: taxCents,
            total_cents: totalCents,
            balance_cents: totalCents,
            preferred_payment_method: defaultPaymentMethodById.get(clientId) ?? null,
          })
          .select("id")
          .single();
        if (error || !invoice) {
          // Report the row and keep going — throwing here left earlier rows
          // created with no result ever shown to the importer.
          failed.push({ row: rowNo, error: `could not be imported: ${error?.message ?? "insert failed"}` });
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: itemErr } = await (supabase as any).from("crm_invoice_line_items").insert({
          invoice_id: invoice.id,
          service_id: serviceId,
          description: r.description.trim(),
          qty: 1,
          rate_cents: amountCents,
          total_cents: amountCents,
          is_taxable: taxCents > 0,
        });
        // An invoice header with no line item would recalculate to $0 on its
        // first edit. Throwing here used to abort the rest of the file AND leave
        // that empty header behind; now the header is soft-deleted (it has no
        // number yet — numbers are assigned below) and the row is reported.
        if (itemErr) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: undoErr } = await (supabase as any)
            .from("crm_invoices")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", invoice.id);
          failed.push({
            row: rowNo,
            error: `line item could not be saved (${itemErr.message ?? "insert failed"}) — not imported${undoErr ? `; the empty draft invoice could not be removed: ${undoErr.message}` : ""}`,
          });
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoiceNumber } = await (supabase as any).rpc("assign_invoice_number", { p_invoice_id: invoice.id });

        // Log to the client's activity timeline (same as useAssignInvoiceNumber).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("client_activity").insert({
          client_id: clientId,
          activity_type: "invoice",
          subject: invoiceNumber != null ? `Invoice #${invoiceNumber}` : "Invoice",
          amount_cents: totalCents,
          ref_id: invoice.id,
          ref_table: "crm_invoices",
        });
        created++;
      }

      return { succeeded: created, failed, skipped, warnings };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}

// ── assign invoice number (called on explicit save of a draft) ────────────────

export function useAssignInvoiceNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId, amountCents }: { id: string; clientId: string; amountCents?: number }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: num, error } = await (supabase.rpc as any)("assign_invoice_number", { p_invoice_id: id });
      if (error) throw error;
      // Now that we have a real number, log to activity timeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        client_id: clientId,
        activity_type: "invoice",
        subject: `Invoice #${num}`,
        ref_id: id,
        ref_table: "crm_invoices",
        amount_cents: amountCents ?? 0,
      });
      return num as number;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

// ── soft-delete invoice (used to discard unsaved drafts) ──────────────────────

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const supabase = createClient();
      // The soft delete below is rejected by the DB when money is applied to
      // the invoice — but only AFTER its lines were wiped and its materials
      // reset, which left a live invoice with a total and no lines (and its
      // materials free to be billed again). Refuse up front, before anything
      // is destroyed; the stale-view case (a payment landed while this
      // invoice was open) is exactly when the UI's own guard has the old data.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: currentErr } = await (supabase as any)
        .from("crm_invoices")
        .select("amount_paid_cents, locked, qbo_invoice_id")
        .eq("id", id)
        .single();
      if (currentErr) throw currentErr;
      if (current?.qbo_invoice_id) {
        throw new Error("This invoice is synced to QuickBooks. Void it instead so QuickBooks is updated too.");
      }
      if ((current?.amount_paid_cents ?? 0) > 0) {
        throw new Error("This invoice cannot be deleted: payments are applied to it. Refund or unapply them first.");
      }
      // A locked invoice's lines can't be deleted (trigger) — and that failure
      // used to land AFTER its materials were reset to pending and their stock
      // restored, leaving the invoice live while the materials were free to be
      // billed (and counted back into inventory) a second time.
      if (current?.locked) {
        throw new Error("This invoice is locked. Unlock it before deleting it.");
      }
      // Free any materials this draft billed before its lines disappear.
      const { data: lines, error: linesErr } = await supabase
        .from("crm_invoice_line_items")
        .select("id")
        .eq("invoice_id", id);
      if (linesErr) throw linesErr;
      await resetJobProductsForLines(supabase, (lines ?? []).map((l) => l.id));
      // Line items are otherwise never deleted (soft-delete happens only on
      // the parent invoice), but a visit-linked line item now carries a
      // unique constraint on visit_id (crm_invoice_line_items_visit_id_unique)
      // — leaving this draft's line items dangling would permanently block
      // those visits from ever being invoiced again, even though discarding
      // an unsaved draft is exactly the one case meant to free them back up.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: lineItemsError } = await (supabase as any)
        .from("crm_invoice_line_items")
        .delete()
        .eq("invoice_id", id);
      if (lineItemsError) throw lineItemsError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      fireStaleIntentCancel();
    },
  });
}

// ── void invoice ────────────────────────────────────────────────────────────────
// Voiding is different from deleting: the record stays (audit trail, any recorded
// payments remain visible) but it's excluded from balances/AR going forward.

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const supabase = createClient();
      await assertVoidable(supabase, id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ status: "void", balance_cents: 0 })
        .eq("id", id);
      if (error) throwIfVoidGuardError(error);
      // Re-sync the client's outstanding balance now that this invoice is excluded
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("sync_client_balance", { p_client_id: clientId });
      await releaseMaterialsForVoidedInvoice(supabase, id);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      invalidateClientBalances(qc);
      fireQuickBooksInvoiceUpdate(vars.id);
      // A customer's open pay form for this invoice can no longer be submitted.
      fireStaleIntentCancel();
    },
  });
}

// ── duplicate a void invoice ──────────────────────────────────────────────────

export interface DuplicateVoidInvoiceResult {
  invoiceId: string;
  lines: number;
  visitsRelinked: number;
  materialsRelinked: number;
  milestonesRelinked: number;
}

/**
 * Void is final, so billing a void invoice's work again means a new invoice.
 * crm_duplicate_void_invoice copies the header and every line onto a new
 * draft (no number, nothing paid) and, in the same transaction, re-links only
 * what is still unbilled: a visit whose billed tag is free, a material still
 * pending/used on the void line, a milestone the void sent back to pending.
 * Anything billed elsewhere since stays where it is.
 */
export function useDuplicateVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; clientId: string | null }): Promise<DuplicateVoidInvoiceResult> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("crm_duplicate_void_invoice", { p_invoice_id: id });
      if (error) throw error;
      const row = (data ?? {}) as Record<string, unknown>;
      const invoiceId = typeof row.invoice_id === "string" ? row.invoice_id : null;
      if (!invoiceId) throw new Error("The draft could not be created.");
      return {
        invoiceId,
        lines: Number(row.lines ?? 0),
        visitsRelinked: Number(row.visits_relinked ?? 0),
        materialsRelinked: Number(row.materials_relinked ?? 0),
        milestonesRelinked: Number(row.milestones_relinked ?? 0),
      };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      if (vars.clientId) qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      invalidateClientBalances(qc);
      // Materials and milestones it re-linked show as invoiced again.
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["estimate-milestones"] });
      qc.invalidateQueries({ queryKey: ["project-milestones"] });
    },
  });
}

// ── update status ─────────────────────────────────────────────────────────────

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const supabase = createClient();
      // A void here (used by the Invoices list's Void button and bulk
      // actions) must do the same balance-zeroing + client-balance resync as
      // useVoidInvoice — otherwise a voided invoice keeps its old
      // balance_cents and keeps counting toward what the client owes.
      if (status === "void") {
        const inv = await assertVoidable(supabase, id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_invoices")
          .update({ status, balance_cents: 0 })
          .eq("id", id);
        if (error) throwIfVoidGuardError(error);
        if (inv?.clientId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("sync_client_balance", { p_client_id: inv.clientId });
        }
        await releaseMaterialsForVoidedInvoice(supabase, id);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: currentErr } = await (supabase as any)
        .from("crm_invoices")
        .select("status, total_cents, amount_paid_cents, client_id, invoice_number")
        .eq("id", id)
        .single();
      if (currentErr) throw currentErr;
      // Void is final (trg_crm_invoices_void_is_final refuses it too): a void
      // invoice's visits, materials and milestones were released and may be
      // billed elsewhere already. "Duplicate as draft" bills the work again.
      if (current?.status === "void") {
        throw new Error("it is void, and a void invoice can't be reopened — use Duplicate as draft instead");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { status };
      // A manual status can't contradict the payments on the invoice. This hook
      // writes only `status`, so "Mark as Paid" on an unpaid invoice produced
      // status=paid with the full balance still owed (still in AR and still
      // chargeable), and moving a paid/partial invoice back to draft/sent left
      // payments orphaned under a status that ignores them. Paid/partial follow
      // from RECORDED payments, so point the user there instead.
      {
        const total = current?.total_cents ?? 0;
        const paid = current?.amount_paid_cents ?? 0;
        if (status === "paid" && paid < total) {
          throw new Error("its balance is still owed — record a payment to mark it paid");
        }
        if (status === "partial" && !(paid > 0 && paid < total)) {
          throw new Error("Partial is set by recording a payment that doesn't cover the whole invoice");
        }
        if (["draft", "sent", "printed", "viewed", "overdue"].includes(status) && paid > 0 && current?.status !== status) {
          throw new Error("it has payments recorded, so its status follows its payments");
        }
      }
      // Line items autosave but the header totals only move on Save Invoice, so
      // a draft sent without saving would go out at its stale (often $0) total.
      // Re-derive the totals from the saved lines before it leaves draft.
      if (current?.status === "draft" && (status === "sent" || status === "printed")) {
        // Refreshed server-side only: a role that can print/send but not edit invoices may
        // not write the totals from its own session (DB guard), and the client-side recalc's
        // payment reconcile needs an invoice/payment/credit key — its refusal left a printed
        // draft locked and numbered yet still a draft. A draft has no payments (refused
        // above), so re-deriving its totals is all the reconcile would do.
        const refreshed = await fetch(`/api/crm/invoices/${id}/refresh-draft-totals`, { method: "POST" }).catch(() => null);
        if (!refreshed?.ok) throw new Error("could not refresh the invoice totals — try again");
        // Likewise only Save Invoice assigned the number, so a draft sent from
        // here went out numberless (and QuickBooks invented its own). The RPC
        // is idempotent. Same timeline entry as useAssignInvoiceNumber.
        if (current.invoice_number == null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: assigned, error: numErr } = await (supabase.rpc as any)("assign_invoice_number", { p_invoice_id: id });
          if (numErr || assigned == null) throw numErr ?? new Error("could not assign an invoice number");
          if (current.client_id) {
            // The recalc above just rewrote total_cents; `current` is stale.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: fresh } = await (supabase as any).from("crm_invoices").select("total_cents").eq("id", id).single();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("client_activity").insert({
              client_id: current.client_id,
              activity_type: "invoice",
              subject: `Invoice #${assigned}`,
              ref_id: id,
              ref_table: "crm_invoices",
              amount_cents: fresh?.total_cents ?? 0,
            });
          }
        }
      }
      // Issuing a draft that was never numbered (created from a job/estimate and
      // never saved) must not leave a live invoice with no number — the client
      // would receive "Invoice #—". Idempotent RPC; a no-op for numbered ones.
      if (current?.status === "draft" && status !== "draft") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: numErr } = await (supabase.rpc as any)("assign_invoice_number", { p_invoice_id: id });
        if (numErr) throw numErr;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      invalidateClientBalances(qc);
      if (vars.status === "sent") {
        fireQuickBooksInvoiceSync(vars.id);
      } else {
        // Void (or another status change) of an invoice that's already in QuickBooks.
        fireQuickBooksInvoiceUpdate(vars.id);
      }
    },
  });
}

// ── update invoice header fields ──────────────────────────────────────────────

export function useUpdateInvoiceHeader() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        invoice_number?: number;
        invoice_date?: string;
        due_date?: string | null;
        po_number?: string | null;
        terms?: string;
        service_address?: string | null;
        preferred_payment_method?: string | null;
        sales_rep_id?: string | null;
        sale_type?: "new" | "renewal" | null;
        notes?: string | null;
      };
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_invoices").update(patch).eq("id", id);
      if (error) {
        // 23505 = crm_invoices_org_number_unique: another live invoice already
        // carries this number.
        if ((error as { code?: string }).code === "23505" && patch.invoice_number !== undefined) {
          throw new Error(`Invoice number ${patch.invoice_number} is already used by another invoice. Choose a different number.`);
        }
        throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      // Only the header fields QuickBooks mirrors (number, dates, terms) matter;
      // PO#, sales rep, payment method etc. don't go over.
      const p = vars.patch;
      if (p.invoice_number !== undefined || p.invoice_date !== undefined || p.due_date !== undefined || p.terms !== undefined) {
        fireQuickBooksInvoiceUpdate(vars.id);
      }
    },
  });
}

// ── record payment ────────────────────────────────────────────────────────────

// Payment recording/editing runs entirely in the crm_record_payment /
// crm_update_payment RPCs (one transaction) — see 20261004000300.

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      amountCents,
      paymentDate,
      method,
      reference,
      memo,
      isPrepayment,
      isCredit,
      allocations,
    }: {
      clientId: string;
      amountCents: number;
      paymentDate: string;
      method: string;
      reference?: string;
      memo?: string;
      isPrepayment?: boolean;
      isCredit?: boolean;
      allocations?: { invoiceId: string; amountCents: number }[];
    }) => {
      const supabase = createClient();
      // One transaction in the DB (crm_record_payment): payment row, split,
      // per-invoice apply and client balance sync all commit or roll back
      // together. Allocation normalisation (drop empties, reject draft/void,
      // cap at open balance) happens there under row locks.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)("crm_record_payment", {
        p_client_id: clientId,
        p_amount_cents: amountCents,
        p_payment_date: paymentDate,
        p_method: method,
        p_reference: reference ?? null,
        p_memo: memo ?? null,
        p_is_prepayment: isPrepayment ?? false,
        p_is_credit: isCredit ?? false,
        p_allocations: (allocations ?? []).map((a) => ({ invoice_id: a.invoiceId, amount_cents: a.amountCents })),
      });
      if (rpcErr) throw rpcErr;
      const rec = rpcData as { payment_id: string; newly_paid_invoice_ids: string[]; has_allocations: boolean };
      const inserted = { id: rec.payment_id };
      const newlyPaidInvoiceIds: string[] = rec.newly_paid_invoice_ids ?? [];
      const hasAlloc = rec.has_allocations;

      const refLabel = reference ? ` #${reference}` : "";
      const dateLabel = paymentDate ? ` on ${paymentDate}` : "";
      const label = isCredit
        ? `Account credit issued${memo ? `: ${memo}` : ""}${dateLabel}`
        : isPrepayment
          ? `Prepayment recorded: ${method}${refLabel}${dateLabel}`
          : hasAlloc
            ? `Payment received: ${method}${refLabel}${dateLabel}`
            : `Payment recorded: ${method}${refLabel}${dateLabel}`;
      // ref_id/ref_table point at the payment itself (not the invoice) so
      // clicking this activity entry can open the payment's own detail/edit
      // screen — matches how refunds already reference crm_payments.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        client_id: clientId,
        activity_type: "payment",
        subject: label,
        amount_cents: amountCents,
        ref_id: inserted.id,
        ref_table: "crm_payments",
      });

      return { newlyPaidInvoiceIds, paymentId: inserted.id, hasAllocations: hasAlloc };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      invalidateClientBalances(qc);
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
      // Paid by hand: cancel any open online pay form the customer still has for these invoices.
      fireStaleIntentCancel();
      for (const invoiceId of data?.newlyPaidInvoiceIds ?? []) {
        fireAutomationTrigger({ triggerType: "invoice_paid", clientId: vars.clientId, invoiceId });
      }
      if (data?.hasAllocations) {
        fireQuickBooksPaymentSync(data.paymentId);
      }
    },
  });
}

// ── update payment ────────────────────────────────────────────────────────────

/** Status of a set of invoices, for spotting which ones a payment edit just paid off. */
async function invoiceStatusById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[]
): Promise<Map<string, { status: string; clientId: string | null }>> {
  const out = new Map<string, { status: string; clientId: string | null }>();
  if (ids.length === 0) return out;
  const { data } = await supabase.from("crm_invoices").select("id, status, client_id").in("id", ids);
  for (const r of (data ?? []) as { id: string; status: string; client_id: string | null }[]) {
    out.set(r.id, { status: r.status, clientId: r.client_id });
  }
  return out;
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
      amountCents,
      paymentDate,
      method,
      reference,
      memo,
      allocations,
    }: {
      id: string;
      clientId: string;
      amountCents: number;
      paymentDate: string;
      method: string;
      reference?: string;
      memo?: string;
      allocations?: { invoiceId: string; amountCents: number }[];
    }) => {
      const supabase = createClient();
      // crm_update_payment (and crm_apply_credit_to_invoice) return no "newly paid"
      // flag, so editing a payment — or applying credit — that paid an invoice off
      // never fired the invoice_paid automation. Compare statuses around the call.
      const touchedIds = [...new Set((allocations ?? []).map((a) => a.invoiceId))];
      const statusBefore = await invoiceStatusById(supabase, touchedIds);
      // One transaction in the DB (crm_update_payment): validates + caps the new
      // split, reverses the original allocations, rewrites the payment and split,
      // re-applies to invoices and syncs the client balance — all or nothing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcErr } = await (supabase.rpc as any)("crm_update_payment", {
        p_payment_id: id,
        p_client_id: clientId,
        p_amount_cents: amountCents,
        p_payment_date: paymentDate,
        p_method: method,
        p_reference: reference ?? null,
        p_memo: memo ?? null,
        p_allocations: (allocations ?? []).map((a) => ({ invoice_id: a.invoiceId, amount_cents: a.amountCents })),
      });
      if (rpcErr) throw rpcErr;
      const statusAfter = await invoiceStatusById(supabase, touchedIds);
      return {
        newlyPaid: touchedIds
          .filter((invId) => statusAfter.get(invId)?.status === "paid" && statusBefore.get(invId)?.status !== "paid")
          .map((invId) => ({ invoiceId: invId, clientId: statusAfter.get(invId)?.clientId ?? null })),
      };
    },
    onSuccess: (result, vars) => {
      for (const n of result?.newlyPaid ?? []) {
        fireAutomationTrigger({ triggerType: "invoice_paid", clientId: n.clientId ?? vars.clientId, invoiceId: n.invoiceId });
      }
      // Updates, voids or pushes this payment's QuickBooks side to match the edit
      // (crm_update_payment flags changed links and queues removed ones).
      fireQuickBooksPaymentSync(vars.id);
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      invalidateClientBalances(qc);
      // The edit dialog stays mounted and just toggles `open` rather than
      // remounting, so it relies entirely on this invalidation to pick up
      // the new split — without it, reopening the same payment within the
      // 60s global staleTime shows the pre-edit allocations, and saving
      // again reverses the wrong amounts against invoices.
      qc.invalidateQueries({ queryKey: ["crm-payment-allocations", vars.id] });
    },
  });
}

// ── refund payment ────────────────────────────────────────────────────────────

export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      refundAmountCents,
      idempotencyToken,
    }: {
      id: string;
      clientId: string;
      refundAmountCents: number;
      invoiceId?: string | null;
      /** One per dialog open — makes a repeated submit the same Stripe refund. */
      idempotencyToken?: string;
    }) => {
      // Routed through a server API instead of writing directly from the
      // browser: a card/ACH payment's refund has to call Stripe (which
      // needs the secret key) before the books can say "refunded" — see
      // src/app/api/crm/payments/[id]/refund/route.ts. A cash/check payment
      // with no stripe_payment_intent_id skips Stripe there and is
      // bookkeeping-only, same as this used to be for every payment.
      const res = await fetch(`/api/crm/payments/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundAmountCents, idempotencyToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to issue refund");
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      invalidateClientBalances(qc);
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

// ── upsert line item ──────────────────────────────────────────────────────────

/** Shared by the line-item upsert/delete mutations so InvoiceDetail can wait for in-flight row saves before validating a Save. */
export const LINE_ITEM_MUTATION_KEY = ["crm-invoice-line-item"] as const;

export function useUpsertInvoiceLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: LINE_ITEM_MUTATION_KEY,
    mutationFn: async ({
      invoiceId,
      item,
      recalc = false,
    }: {
      invoiceId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item: Record<string, any>;
      /** After updating an existing line, re-derive and persist the invoice's header totals. */
      recalc?: boolean;
    }) => {
      const supabase = createClient();
      // A blind .upsert() with a partial payload fails NOT NULL validation
      // on columns like description that aren't in the patch — Postgres
      // checks the INSERT side of "INSERT ... ON CONFLICT DO UPDATE"
      // regardless of whether the conflict branch fires. Existing rows must
      // go through a real UPDATE instead.
      if (item.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { id, ...patch } = item;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_invoice_line_items")
          .update(patch)
          .eq("id", id);
        if (error) throwIfLockedInvoiceError(error);
        // A tax-affecting edit (taxable toggle) must not leave the stored
        // header's tax_cents/total_cents stale until the next Save.
        if (recalc) await recalcInvoiceTotalsFromLines(supabase, invoiceId);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_invoice_line_items")
          .insert({ invoice_id: invoiceId, ...item });
        if (error) throwIfLockedInvoiceError(error);
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.invoiceId] });
      if (vars.recalc) {
        qc.invalidateQueries({ queryKey: ["crm-invoices"] });
        invalidateClientBalances(qc);
      }
    },
  });
}

/**
 * After an invoice's total changes, brings its payments back in line — in one
 * transaction (crm_reconcile_invoice_payments, 20260927100300):
 *   - total dropped below what's been paid → the excess allocations move back
 *     onto the paying payments as unused client credit; status stays paid
 *   - total rose above what's been paid → status becomes partial (or back to
 *     sent if nothing is paid) with the real balance due
 * The editors used to just write balance = max(0, total − paid), leaving a
 * "paid" invoice with money due, or amount_paid > total with the excess
 * credited nowhere.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reconcileInvoicePayments(supabase: any, invoiceId: string): Promise<{ wasNewlyPaid: boolean }> {
  const { data, error } = await supabase.rpc("crm_reconcile_invoice_payments", { p_invoice_id: invoiceId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { wasNewlyPaid: !!row?.was_newly_paid };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resetJobProductsForLines(supabase: any, lineItemIds: string[]) {
  if (lineItemIds.length === 0) return;
  const { data: products, error } = await supabase
    .from("crm_job_products")
    .select("id")
    .in("invoice_line_item_id", lineItemIds)
    .eq("status", "invoiced");
  if (error) throw error;
  for (const p of (products ?? []) as { id: string }[]) {
    const { error: rpcErr } = await supabase.rpc("set_job_product_status", {
      p_job_product_id: p.id,
      p_new_status: "pending",
    });
    if (rpcErr) throw rpcErr;
  }
}

// Shared by useDeleteInvoiceLineItem and useSetJobProductStatus (removing a
// job product from an invoice deletes its line item the same way).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteInvoiceLineItemAndRecalc(supabase: any, id: string, invoiceId: string) {
  // Refuse before touching the materials: a locked invoice rejects the line
  // delete (trigger), and that used to happen AFTER the materials were reset to
  // pending with their stock restored — the line stayed, the materials were
  // free to be billed again.
  const { data: lockRow, error: lockErr } = await supabase
    .from("crm_invoices")
    .select("locked")
    .eq("id", invoiceId)
    .single();
  if (lockErr) throw lockErr;
  if (lockRow?.locked) throw new Error(LOCKED_INVOICE_MESSAGE);

  // A material billed by this line is 'invoiced'; deleting the line nulls its
  // link (ON DELETE SET NULL) but leaves the status, so nothing would ever
  // bill it again and its stock stays decremented. Send it back to pending.
  await resetJobProductsForLines(supabase, [id]);

  // The visit_id tag on a visit's first line is the "this visit is billed"
  // key every invoicing path checks. Deleting that line must not make the
  // visit look unbilled while its other lines are still on the invoice (a
  // re-completion would bill it again), so the tag moves to one of them.
  const tagTarget = await findVisitTagSuccessor(supabase, id, invoiceId);

  // Delete the line item
  const { error } = await supabase
    .from("crm_invoice_line_items")
    .delete()
    .eq("id", id);
  if (error) throwIfLockedInvoiceError(error);

  // After the delete: crm_invoice_line_items_visit_id_unique allows one row per visit.
  let tagErr: { message?: string } | null = null;
  if (tagTarget) {
    const { error: moveErr } = await supabase
      .from("crm_invoice_line_items")
      .update({ visit_id: tagTarget.visitId })
      .eq("id", tagTarget.lineId)
      .is("visit_id", null);
    tagErr = moveErr;
  }

  const result = await recalcInvoiceTotalsFromLines(supabase, invoiceId);
  if (tagErr) {
    throw new Error(
      `The line was removed, but the visit's "already invoiced" marker could not be moved to its remaining line (${tagErr.message ?? "unknown error"}). Don't re-complete that visit until this is fixed, or it may be billed again.`,
    );
  }
  return result;
}

/**
 * When the line being deleted carries a visit_id tag, the remaining line of
 * the same visit that should inherit it. A visit's lines are written
 * together with the tag on the first, so its other lines are the untagged
 * ones that follow it (same service date) up to the next visit's tagged
 * line. On an invoice that bills only this one visit, any remaining line of
 * the same service date qualifies.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findVisitTagSuccessor(supabase: any, lineId: string, invoiceId: string): Promise<{ lineId: string; visitId: string } | null> {
  const { data: rows, error } = await supabase
    .from("crm_invoice_line_items")
    .select("id, visit_id, service_date, sort_order, created_at")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const lines = (rows ?? []) as { id: string; visit_id: string | null; service_date: string | null }[];
  const idx = lines.findIndex((l) => l.id === lineId);
  const deleted = idx >= 0 ? lines[idx] : null;
  if (!deleted?.visit_id) return null;
  const sameDay = (l: { service_date: string | null }) => l.service_date === deleted.service_date;
  for (let i = idx + 1; i < lines.length && !lines[i].visit_id; i++) {
    if (sameDay(lines[i])) return { lineId: lines[i].id, visitId: deleted.visit_id };
  }
  if (lines.some((l) => l.id !== lineId && l.visit_id)) return null;
  const other = lines.find((l) => l.id !== lineId && sameDay(l));
  return other ? { lineId: other.id, visitId: deleted.visit_id } : null;
}

/**
 * Re-derives an invoice's stored header totals (subtotal/discount/tax/total/
 * balance) from its persisted line items via computeInvoiceTotals, then
 * reconciles payments. Used after any line change that must not leave stale
 * tax_cents/total_cents (line delete, taxable toggle).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalcInvoiceTotalsFromLines(supabase: any, invoiceId: string) {
  // Recalculate invoice totals from remaining line items
  // Both reads must succeed: a swallowed failure would recompute the invoice
  // from zero line items and write a $0 total over the real one.
  const { data: inv, error: invReadErr } = await supabase
    .from("crm_invoices")
    .select("amount_paid_cents, tax_rate_bps, discount_cents, discount_type, discount_value, client_id")
    .eq("id", invoiceId)
    .single();
  if (invReadErr) throw invReadErr;
  const { data: items, error: itemsReadErr } = await supabase
    .from("crm_invoice_line_items")
    .select("total_cents, discount_cents, is_taxable")
    .eq("invoice_id", invoiceId);
  if (itemsReadErr) throw itemsReadErr;

  // Same arithmetic as an edit (useUpdateInvoiceFinancials): percent discounts
  // are re-derived from the new subtotal and every discount is clamped to it,
  // so deleting lines can't leave a stale/oversized discount that drives the
  // total negative.
  const { subtotalCents, discountCents, taxCents, totalCents } = computeInvoiceTotals({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (items ?? []).map((li: any) => ({
      totalCents: li.total_cents,
      discountCents: li.discount_cents ?? 0,
      isTaxable: !!li.is_taxable,
    })),
    discountCents: inv?.discount_cents ?? 0,
    discountType: inv?.discount_type ?? null,
    discountValue: inv?.discount_value ?? null,
    taxRateBps: inv?.tax_rate_bps ?? 0,
  });
  const paid = inv?.amount_paid_cents ?? 0;
  const balanceCents = Math.max(0, totalCents - paid);

  const { error: updateErr } = await supabase.from("crm_invoices").update({
    subtotal_cents: subtotalCents,
    discount_cents: discountCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    balance_cents: balanceCents,
  }).eq("id", invoiceId);
  if (updateErr) throwIfLockedInvoiceError(updateErr);

  // Status/allocations/credit for the new total (also re-syncs the client's
  // balances).
  const { wasNewlyPaid } = await reconcileInvoicePayments(supabase, invoiceId);

  // A line delete / taxable toggle just changed what QuickBooks should hold.
  fireQuickBooksInvoiceUpdate(invoiceId);

  return { invoiceId, clientId: inv?.client_id as string | undefined, wasNewlyPaid };
}

export function useDeleteInvoiceLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: LINE_ITEM_MUTATION_KEY,
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient();
      return deleteInvoiceLineItemAndRecalc(supabase, id, invoiceId);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.invoiceId] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      invalidateClientBalances(qc);
    },
  });
}

// ── update invoice financials ─────────────────────────────────────────────────

export function useUpdateInvoiceFinancials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      lineItems,
      taxRateBps,
      discountCents,
      discountType,
      discountValue,
      appliedDiscountId,
      terms,
    }: {
      id: string;
      lineItems: InvoiceLineItem[];
      taxRateBps: number;
      discountCents: number;
      discountType?: "percent" | "flat" | null;
      discountValue?: number | null;
      appliedDiscountId?: string | null;
      terms?: string | null;
    }) => {
      // Subtotal is net of each line's own discount; the document-level
      // discount is a separate reduction stacked on top of that. One shared
      // helper (see computeInvoiceTotals) keeps this identical to a line
      // delete's recompute.
      const computed = computeInvoiceTotals({
        lines: lineItems.map((li) => ({
          totalCents: li.totalCents,
          discountCents: li.discountCents,
          isTaxable: !!li.isTaxable,
        })),
        discountCents,
        discountType,
        discountValue,
        taxRateBps,
      });
      const { subtotalCents, taxCents, totalCents } = computed;
      discountCents = computed.discountCents;
      taxRateBps = computed.taxRateBps;
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inv, error: invReadErr } = await (supabase as any)
        .from("crm_invoices")
        .select("amount_paid_cents, client_id")
        .eq("id", id)
        .single();
      if (invReadErr) throw invReadErr;
      const paid = inv?.amount_paid_cents ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        discount_type: discountType ?? null,
        discount_value: discountValue ?? null,
        applied_discount_id: appliedDiscountId ?? null,
        tax_rate_bps: taxRateBps,
        tax_cents: taxCents,
        total_cents: totalCents,
        balance_cents: Math.max(0, totalCents - paid),
      };
      if (terms !== undefined) patch.terms = terms;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_invoices").update(patch).eq("id", id);
      if (error) throwIfLockedInvoiceError(error);

      // Status/allocations/credit for the new total (also re-syncs the
      // client's balances).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { wasNewlyPaid } = await reconcileInvoicePayments(supabase as any, id);
      return { wasNewlyPaid, clientId: (inv?.client_id as string | undefined) ?? null };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      invalidateClientBalances(qc);
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      if (data?.wasNewlyPaid && data.clientId) {
        fireAutomationTrigger({ triggerType: "invoice_paid", clientId: data.clientId, invoiceId: vars.id });
      }
      fireQuickBooksInvoiceUpdate(vars.id);
    },
  });
}

// ── payments list ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPaymentFull(row: any): CRMPayment {
  return {
    id: row.id,
    orgId: row.org_id,
    invoiceId: row.invoice_id,
    clientId: row.client_id,
    amountCents: row.amount_cents,
    unusedAmountCents: row.unused_amount_cents ?? 0,
    refundedAmountCents: row.refunded_amount_cents ?? 0,
    processingFeeCents: row.processing_fee_cents ?? 0,
    paymentDate: row.payment_date,
    method: row.method,
    reference: row.reference,
    memo: row.memo ?? null,
    notes: row.notes,
    isPrepayment: row.is_prepayment ?? false,
    isCredit: row.is_credit ?? false,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
    clientAddress: row.clients?.billing_address ?? null,
    invoiceNumber: row.crm_invoices?.invoice_number ?? null,
  };
}

const PAYMENT_METHODS = [
  "ACH/E-Check", "AR Write-off", "AutoPay", "Cash", "Check",
  "Credit Card- AmEx", "Credit Card- Discover", "Credit Card- MasterCard",
  "Credit Card- Visa", "Debit Card- Discover", "Debit Card- MasterCard", "Debit Card- Visa", "Other",
];

export function useBulkImportPayments() {
  // Imported rows without a date mean "today" on the ORG's calendar, not
  // the importer's laptop or the UTC server.
  const orgTimeZone = useOrgTimeZone();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Paged — see the invoice importer.
      const clients = await fetchAllRows<{ id: string; display_name: string; account_number: string | null }>(() =>
        supabase.from("clients").select("id, display_name, account_number").is("deleted_at", null).order("id")
      );
      // Name matching is a fallback only: display names aren't unique, and a
      // plain Map let the LAST duplicate silently win — payments landed on
      // the wrong client. Track every id per name so ambiguous names can be
      // refused, and prefer an explicit clientId / accountNumber column.
      const idsByName = new Map<string, string[]>();
      const byAccountNumber = new Map<string, string>();
      const clientIds = new Set<string>();
      for (const c of clients ?? []) {
        clientIds.add(c.id);
        const key = c.display_name.trim().toLowerCase();
        idsByName.set(key, [...(idsByName.get(key) ?? []), c.id]);
        if (c.account_number?.trim()) byAccountNumber.set(c.account_number.trim().toLowerCase(), c.id);
      }
      const resolveClient = (r: Record<string, string>): { clientId: string | null; reason?: string } => {
        const explicitId = r.clientId?.trim();
        if (explicitId) {
          return clientIds.has(explicitId)
            ? { clientId: explicitId }
            : { clientId: null, reason: `Client id "${explicitId}" not found — not imported` };
        }
        const accountNumber = r.accountNumber?.trim();
        if (accountNumber) {
          const id = byAccountNumber.get(accountNumber.toLowerCase());
          return id
            ? { clientId: id }
            : { clientId: null, reason: `Account number "${accountNumber}" not found — not imported` };
        }
        const name = r.clientName?.trim() ?? "";
        const matches = idsByName.get(name.toLowerCase()) ?? [];
        if (matches.length > 1) {
          return {
            clientId: null,
            reason: `${matches.length} clients are named "${name}" — add an accountNumber column to say which one; not imported`,
          };
        }
        return { clientId: matches[0] ?? null };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoices = await fetchAllRows<any>(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("crm_invoices").select("id, invoice_number, client_id").is("deleted_at", null).order("id")
      );
      const invoiceByNumberAndClient = new Map<string, string>(
        (invoices ?? [])
          .filter((i: { invoice_number: number | null }) => i.invoice_number != null)
          .map((i: { invoice_number: number; client_id: string; id: string }): [string, string] => [`${i.client_id}:${i.invoice_number}`, i.id])
      );

      // Re-running an import must not record the same payment twice: a row
      // matching a live payment of the same client, amount, date and
      // reference / check # is skipped. Each existing payment absorbs at most
      // ONE row, so two genuinely identical payments in one file still both
      // import the first time.
      const existingPayments = await fetchAllRows<{
        id: string; client_id: string; amount_cents: number; payment_date: string; reference: string | null;
      }>(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("crm_payments")
          .select("id, client_id, amount_cents, payment_date, reference")
          .is("deleted_at", null)
          .order("id")
      );
      const paymentKey = (clientId: string, amountCents: number, date: string, reference: string | null | undefined) =>
        `${clientId}|${amountCents}|${date}|${(reference ?? "").trim().toLowerCase()}`;
      const existingByKey = new Map<string, string[]>();
      for (const p of existingPayments) {
        const k = paymentKey(p.client_id, p.amount_cents, p.payment_date, p.reference);
        existingByKey.set(k, [...(existingByKey.get(k) ?? []), p.id]);
      }

      let created = 0;
      // CSV line numbers (line 1 is the header), like every other importer.
      const failed: BulkImportResult["failed"] = [];
      const skipped: BulkImportResult["failed"] = [];
      /** Imported, but not (fully) applied to the invoice named — kept as account credit. */
      const warnings: BulkImportResult["failed"] = [];
      const touchedClientIds = new Set<string>();

      for (const [index, r] of rows.entries()) {
        const rowNumber = index + 2;
        // A file exported from the Payments list's Deleted tab carries a
        // "deleted" column; re-importing it must not bring deleted payments back.
        const deletedMark = (r.deleted ?? "").trim().toLowerCase();
        if (deletedMark && !["no", "n", "false", "0"].includes(deletedMark)) {
          failed.push({ row: rowNumber, error: "Payment is marked deleted (Deleted column) — not imported" });
          continue;
        }
        const { clientId, reason: clientReason } = resolveClient(r);
        if (clientReason) {
          failed.push({ row: rowNumber, error: clientReason });
          continue;
        }
        // parseFloat("1,234.50") was 1 and parseFloat("$500") was NaN: an Excel /
        // QuickBooks export recorded $1.00 or dropped the row. Same parser as
        // the invoice importer ($ and thousands separators stripped).
        const rawAmount = (r.amount ?? "").trim();
        const amountCents = parseCsvMoneyCents(rawAmount);
        if (!clientId) {
          failed.push({ row: rowNumber, error: `Client "${r.clientName?.trim() ?? ""}" not found — not imported` });
          continue;
        }
        if (amountCents <= 0) {
          failed.push({
            row: rowNumber,
            error: rawAmount ? `Amount "${rawAmount}" is not a positive dollar amount — not imported` : "Amount is missing — not imported",
          });
          continue;
        }
        const paymentDate = r.paymentDate?.trim() ? normalizeCsvDate(r.paymentDate) : todayInZone(orgTimeZone);
        if (!paymentDate) {
          failed.push({ row: rowNumber, error: `Date "${r.paymentDate?.trim()}" is not a valid date (use YYYY-MM-DD or M/D/YYYY) — not imported` });
          continue;
        }
        const dupCandidates = existingByKey.get(paymentKey(clientId, amountCents, paymentDate, r.reference));
        if (dupCandidates?.length) {
          dupCandidates.shift();
          skipped.push({
            row: rowNumber,
            error: `A ${formatCents(amountCents)} payment on ${paymentDate}${r.reference?.trim() ? ` (ref ${r.reference.trim()})` : ""} is already recorded for this client — skipped`,
          });
          continue;
        }

        const method = PAYMENT_METHODS.find((m) => m.toLowerCase() === r.method?.trim().toLowerCase()) ?? "Check";
        const invoiceNumber = r.invoiceNumber ? parseInt(r.invoiceNumber, 10) : null;
        const invoiceId = invoiceNumber ? invoiceByNumberAndClient.get(`${clientId}:${invoiceNumber}`) ?? null : null;
        if (invoiceNumber && !invoiceId) {
          warnings.push({ row: rowNumber, error: `Invoice #${invoiceNumber} not found for this client — recorded as account credit` });
        }

        // Inserted as unapplied credit first; the application below goes
        // through crm_apply_credit_to_invoice(), which in ONE transaction
        // clamps to the invoice's open balance, refuses draft/void invoices,
        // writes the allocation and moves unused → applied. Anything it
        // doesn't apply simply stays on the payment as client credit. This
        // used to insert an allocation for the FULL amount (ignoring its
        // error) and then blindly add +amount to the invoice — an overpaid,
        // draft or void invoice ended up with amount_paid > total and no
        // matching allocation.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: payment, error } = await (supabase as any).from("crm_payments").insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          invoice_id: null,
          amount_cents: amountCents,
          unused_amount_cents: amountCents,
          payment_date: paymentDate,
          method,
          reference: r.reference?.trim() || null,
          memo: r.memo?.trim() || null,
        }).select("id").single();
        if (error) {
          failed.push({ row: rowNumber, error: `Not imported: ${error.message ?? "insert failed"}` });
          continue;
        }
        created++;
        touchedClientIds.add(clientId);

        if (invoiceId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: appliedCents, error: applyErr } = await (supabase.rpc as any)("crm_apply_credit_to_invoice", {
            p_payment_id: payment.id,
            p_invoice_id: invoiceId,
            p_amount_cents: amountCents,
          });
          if (applyErr) {
            warnings.push({
              row: rowNumber,
              error: `Invoice #${invoiceNumber}: ${applyErr.message ?? "could not apply"} — recorded as account credit`,
            });
            continue;
          }
          const applied = typeof appliedCents === "number" ? appliedCents : 0;
          if (applied > 0) {
            // Single-invoice payment: point it at its invoice like a manually
            // recorded one (its allocation row is what carries the amount).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: linkErr } = await (supabase as any)
              .from("crm_payments")
              .update({ invoice_id: invoiceId })
              .eq("id", payment.id);
            if (linkErr) warnings.push({ row: rowNumber, error: `Applied, but linking to invoice #${invoiceNumber} failed: ${linkErr.message}` });
          }
          if (applied < amountCents) {
            warnings.push({
              row: rowNumber,
              error: `Invoice #${invoiceNumber} only had ${formatCents(applied)} open — ${formatCents(amountCents - applied)} recorded as account credit`,
            });
          }
        }
      }

      for (const clientId of touchedClientIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("sync_client_balance", { p_client_id: clientId });
      }

      return { succeeded: created, failed, skipped, warnings };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}

/** A client's payments that still have money on them not applied to anything —
 * proposal deposits, prepayments, overpayments. Narrow and guarded on purpose:
 * usePayments() with no clientId would pull every payment in the org.
 *
 * A proposal deposit is reserved for its estimate (crm_payments.estimate_id).
 * With `invoiceId`, a reserved deposit is only listed when that invoice belongs
 * to the estimate (estimate_owns_invoice — the same rule the allocation trigger
 * enforces), so the Apply credit picker never offers money it would refuse. */
export interface UnappliedPayment {
  id: string;
  paymentDate: string;
  method: string;
  memo: string | null;
  unusedAmountCents: number;
  isPrepayment: boolean;
  /** Set on a proposal deposit reserved for that estimate. */
  estimateId: string | null;
}

export function useUnappliedPayments(clientId: string | undefined, invoiceId?: string) {
  return useQuery<UnappliedPayment[]>({
    queryKey: ["crm-payments", "unapplied", clientId ?? "none", invoiceId ?? "any"],
    enabled: !!clientId,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_payments")
        .select("id, payment_date, method, memo, unused_amount_cents, is_prepayment, estimate_id")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .gt("unused_amount_cents", 0)
        .order("payment_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      const owns = new Map<string, boolean>();
      const kept: Record<string, unknown>[] = [];
      for (const r of rows) {
        const estimateId = (r.estimate_id as string | null) ?? null;
        if (estimateId) {
          if (!invoiceId) continue;
          if (!owns.has(estimateId)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: ok, error: ownsErr } = await (supabase.rpc as any)("estimate_owns_invoice", {
              p_estimate_id: estimateId,
              p_invoice_id: invoiceId,
            });
            if (ownsErr) throw ownsErr;
            owns.set(estimateId, ok === true);
          }
          if (!owns.get(estimateId)) continue;
        }
        kept.push(r);
      }
      return kept.map((r) => ({
        id: r.id as string,
        paymentDate: r.payment_date as string,
        method: r.method as string,
        memo: (r.memo as string) ?? null,
        unusedAmountCents: (r.unused_amount_cents as number) ?? 0,
        isPrepayment: (r.is_prepayment as boolean) ?? false,
        estimateId: (r.estimate_id as string | null) ?? null,
      }));
    },
  });
}

/**
 * Applies money already sitting unapplied on a client's payment (a proposal
 * deposit, a prepayment, an overpayment) to one invoice.
 *
 * Until now the only way to do this was to open the payment and edit its
 * allocations, which meant staff had to know the money existed at all — a
 * converted job invoices its full amount with no deposit deducted, so an
 * unnoticed deposit meant billing a client for money they had already paid.
 *
 * Applies the SMALLER of what's unapplied and what the invoice still owes, so
 * it can never over-allocate; the remainder stays available for the next
 * invoice. The allocation guard trigger enforces the same rule server-side.
 */
export function useApplyCreditToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId,
      invoiceId,
      amountCents,
    }: { paymentId: string; invoiceId: string; amountCents: number }) => {
      const supabase = createClient();
      const before = await invoiceStatusById(supabase, [invoiceId]);
      // One RPC, one transaction. This used to be four separate statements from
      // the browser (insert allocation, decrement unused_amount_cents, apply to
      // the invoice, sync the balance), which had two defects: a failure
      // part-way left the credit consumed with the invoice untouched, and
      // unused_amount_cents was written as an absolute value from a stale read,
      // so two tabs applying the same deposit to different invoices each wrote
      // the same figure and left phantom credit that no allocation could spend.
      // crm_apply_credit_to_invoice takes FOR UPDATE on the payment and
      // recomputes least(requested, unapplied, owing) from the locked rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("crm_apply_credit_to_invoice", {
        p_payment_id: paymentId,
        p_invoice_id: invoiceId,
        p_amount_cents: amountCents,
      });
      if (error) throw new Error(error.message ?? "Couldn't apply the credit");
      // Applying credit can be what pays an invoice off — fire invoice_paid then,
      // the way recording a payment does.
      const after = await invoiceStatusById(supabase, [invoiceId]);
      const newlyPaid = after.get(invoiceId)?.status === "paid" && before.get(invoiceId)?.status !== "paid";
      return { appliedCents: (data as number) ?? 0, newlyPaid, clientId: after.get(invoiceId)?.clientId ?? null };
    },
    onSuccess: (result, vars) => {
      if (result?.newlyPaid && result.clientId) {
        fireAutomationTrigger({ triggerType: "invoice_paid", clientId: result.clientId, invoiceId: vars.invoiceId });
      }
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      invalidateClientBalances(qc);
      // The applied credit (or prepayment) is new money on that invoice for QuickBooks.
      if ((result?.appliedCents ?? 0) > 0) fireQuickBooksPaymentSync(vars.paymentId);
    },
  });
}

/**
 * Payments, optionally narrowed. Payments have no project_id of their own --
 * a payment belongs to a project via the invoice it was applied to, so
 * `projectId` filters on the joined invoice. An unapplied payment (no
 * invoice_id) therefore belongs to no project, which is correct: it's client
 * credit, not project revenue.
 */
export function usePayments(clientId?: string, opts?: { projectId?: string | null; includeDeleted?: boolean }) {
  const projectId = opts?.projectId;
  // The Payments list's Deleted tab needs soft-deleted rows; every other
  // consumer wants live payments only.
  const includeDeleted = opts?.includeDeleted === true;
  const projectKey = projectId === undefined ? "any" : projectId ?? "none";
  return useQuery({
    queryKey: ["crm-payments", clientId ?? "all", { projectId: projectKey, includeDeleted }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // !inner only when filtering by project: an inner join would drop
      // unapplied payments (invoice_id null) from the unfiltered list, which
      // is exactly where they need to show up.
      const invoiceJoin = projectId
        ? "crm_invoices!crm_payments_invoice_id_fkey!inner(invoice_number, project_id)"
        : "crm_invoices!crm_payments_invoice_id_fkey(invoice_number, project_id)";
      // Builders are mutable, so each page gets its own.
      const buildQuery = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from("crm_payments")
          .select(`*, clients(display_name, billing_address), ${invoiceJoin}`, { count: "exact" })
          .order("payment_date", { ascending: false })
          // Tiebreaker: payments share dates, and range paging needs a total order.
          .order("id", { ascending: false });
        if (!includeDeleted) q = q.is("deleted_at", null);
        if (clientId) q = q.eq("client_id", clientId);
        if (projectId) q = q.eq("crm_invoices.project_id", projectId);
        return q;
      };
      // PostgREST caps a plain select at 1000 rows. Fetch page one with the
      // total count, then the remaining pages in parallel — a sequential
      // loop of identical requests is what Sentry flags as an N+1 (LANDSCAPT-8).
      const pageSize = 1000;
      const first = await buildQuery().range(0, pageSize - 1);
      if (first.error) throw first.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [...(first.data ?? [])];
      const total: number = first.count ?? rows.length;
      if (rows.length === pageSize && total > pageSize) {
        const offsets: number[] = [];
        for (let from = pageSize; from < total; from += pageSize) offsets.push(from);
        const pages = await Promise.all(
          offsets.map((from) => buildQuery().range(from, from + pageSize - 1))
        );
        for (const page of pages) {
          if (page.error) throw page.error;
          rows.push(...(page.data ?? []));
        }
      }
      return rows.map(mapPaymentFull) as CRMPayment[];
    },
    enabled: projectId !== null,
  });
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: ["crm-payments", "detail", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_payments")
        .select("*, clients(display_name, billing_address), crm_invoices!crm_payments_invoice_id_fkey(invoice_number)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapPaymentFull(data) as CRMPayment;
    },
    enabled: !!id,
  });
}

/**
 * The exact per-invoice split recorded for a payment. Empty for payments
 * created before crm_payment_allocations existed — callers should fall back
 * to the payment's single invoiceId (if any) in that case, not guess further.
 */
/**
 * Payments recorded on a DIFFERENT client (a parent account — e.g. one check
 * from a property manager) but allocated to one of THIS client's invoices.
 * The sub-account's own usePayments() never sees them (crm_payments.client_id
 * is the parent), so without this the money shows nowhere on the sub-account
 * except inside the invoice's Payment History. Read-only; one query, same
 * allocation join useInvoice() uses. `displayAmountCents` is the share
 * allocated to this client's invoice (not the payment's full amount).
 */
export function useAllocatedPaymentsFromOtherClients(clientId: string | undefined) {
  return useQuery({
    queryKey: ["crm-payments", "allocated-from-parent", clientId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_payment_allocations")
        .select("amount_cents, invoice_id, crm_invoices!inner(client_id, invoice_number), crm_payments!inner(*, clients(display_name))")
        .eq("crm_invoices.client_id", clientId)
        .neq("crm_payments.client_id", clientId)
        .is("crm_payments.deleted_at", null);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[])
        .filter((row) => row.crm_payments)
        .map((row): CRMPayment & { displayAmountCents: number; allocatedInvoiceNumber: number | null } => ({
          ...mapPayment(row.crm_payments),
          displayAmountCents: row.amount_cents as number,
          isSplitAllocation: true,
          allocatedInvoiceNumber: (row.crm_invoices?.invoice_number as number | undefined) ?? null,
        }));
    },
    enabled: !!clientId,
  });
}

export function usePaymentAllocations(paymentId: string | undefined) {
  return useQuery({
    queryKey: ["crm-payment-allocations", paymentId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_payment_allocations")
        .select("invoice_id, amount_cents")
        .eq("payment_id", paymentId);
      if (error) throw error;
      return (data ?? []) as { invoice_id: string; amount_cents: number }[];
    },
    enabled: !!paymentId,
  });
}

// Whether a visit has already produced an invoice line — same idempotency
// check applyVisitCompletionSideEffects() uses (crm_invoice_line_items.visit_id
// is tagged on the first line of whatever invoice a visit's completion billed
// into, whichever completion path got there first). The manual "Create
// Invoice" button in DispatchBoard/JobDetail has no other guard against
// re-invoicing an already-billed visit, which double-bills the client with a
// numberless duplicate invoice — this is what that button checks before
// deciding whether to invoice or just link to the existing one.
export function useInvoiceForVisit(visitId: string | null | undefined) {
  return useQuery({
    queryKey: ["crm-invoices", "for-visit", visitId],
    queryFn: async () => {
      const supabase = createClient();
      const found = await findLiveInvoiceForVisit(supabase, visitId as string);
      return found.invoice;
    },
    enabled: !!visitId,
  });
}


// Why a visit (or job) must not be invoiced from a manual Invoice button —
// the client's contract covers it, or it is a project / snow job — or null.
// The same check createInvoiceFromJob refuses on, so the Dispatch Board can
// hide the button instead of offering one that only errors.
export function useInvoiceBlockReason(
  jobId: string | null | undefined,
  visitId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["crm-invoices", "block-reason", jobId, visitId ?? null],
    queryFn: async () => invoiceBlockReason(createClient(), { jobId: jobId as string, visitId }),
    enabled: !!jobId && enabled,
  });
}

// Whether a job is already covered by a live invoice — mirrors
// applyVisitCompletionSideEffects()'s "job_already_invoiced" guard.
// JobDetail.tsx's job-level "Invoice" button bills every pending
// service/product on the job in one shot, so it links to this instead of
// re-billing once any live invoice exists.
export function useInvoiceForJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["crm-invoices", "for-job", jobId],
    queryFn: async () => {
      const supabase = createClient();
      return findLiveInvoiceCoveringJob(supabase, jobId as string);
    },
    enabled: !!jobId,
  });
}

// ── create invoice from a completed job ───────────────────────────────────────

export type CreateInvoiceFromJobResult = CRMInvoice & {
  /** true when a live invoice already covered the job/visit and nothing was created. */
  alreadyInvoiced: boolean;
};

export function useCreateInvoiceFromJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvoiceFromJobInput): Promise<CreateInvoiceFromJobResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { row, alreadyInvoiced } = await createInvoiceFromJob(supabase, user?.id ?? null, input);
      return { ...mapInvoice(row), alreadyInvoiced };
    },
    onSuccess: (invoice, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      if (invoice.alreadyInvoiced) return;
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
      qc.invalidateQueries({ queryKey: ["crm-job-products", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["crm-job-detail"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      fireAutomationTrigger({ triggerType: "invoice_created", clientId: vars.clientId, invoiceId: invoice.id });
    },
  });
}

// ── automatic invoice when a one-time job is completed ───────────────────────

export interface AutoInvoiceCompletedJobResult {
  /** Null when nothing was invoiced (e.g. the client's contract covers the job). */
  invoiceId: string | null;
  /** true when no new invoice was created (already covered, or skipped). */
  alreadyInvoiced: boolean;
  /** Something the user must know: work left unbilled, or why it was skipped.
   *  Shown as a toast here — Job Detail only toasts a created invoice. */
  warning: string | null;
}

/**
 * The draft invoice a one-time job gets when it is marked Completed from Job
 * Detail. Built and written on the server (/api/crm/jobs/[jobId]/auto-invoice)
 * from the job's own services and products, as the service role — so a role
 * that may complete jobs but lacks acct_add_modify_invoices (Scheduler,
 * Customer Support Rep) still gets it, without being able to write invoices.
 */
export function useAutoInvoiceCompletedJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId }: { jobId: string; clientId: string }): Promise<AutoInvoiceCompletedJobResult> => {
      const res = await fetch(`/api/crm/jobs/${jobId}/auto-invoice`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        invoiceId?: string | null;
        alreadyInvoiced?: boolean;
        skipped?: boolean;
        warning?: string | null;
      };
      if (!res.ok || (!body.invoiceId && !body.skipped)) throw new Error(body.error ?? "Automatic invoice failed");
      return {
        invoiceId: body.invoiceId ?? null,
        alreadyInvoiced: !!body.alreadyInvoiced || !!body.skipped,
        warning: body.warning ?? null,
      };
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      if (result.warning) toast.warning(result.warning, { duration: 10000 });
      if (result.alreadyInvoiced || !result.invoiceId) return;
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
      qc.invalidateQueries({ queryKey: ["crm-job-products", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["crm-job-detail"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      fireAutomationTrigger({ triggerType: "invoice_created", clientId: vars.clientId, invoiceId: result.invoiceId });
    },
  });
}

// ── lock / unlock invoice ─────────────────────────────────────────────────────

export function useSetInvoiceLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ locked, locked_at: locked ? new Date().toISOString() : null })
        .eq("id", id);
      // Toggling `locked` is always allowed by the trigger — this can only
      // fail here if a concurrent request changed a financial column
      // between this mutation reading invoice state and this write landing.
      // Surfacing the same clear message keeps the UI honest about why the
      // lock/unlock didn't take instead of showing a raw driver error.
      if (error) throwIfLockedInvoiceError(error);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}
