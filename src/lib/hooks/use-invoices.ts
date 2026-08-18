"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fireAutomationTrigger } from "@/lib/automations/fire-trigger-client";
import type { CRMInvoice, InvoiceLineItem, CRMPayment } from "@/types/crm-invoices";

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
    salesRepId: row.sales_rep_id ?? null,
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
    clientEmail: row.clients?.primary_email ?? null,
    clientAddress: row.clients
      ? [row.clients.billing_address, row.clients.billing_city, row.clients.billing_state, row.clients.billing_zip]
          .filter(Boolean).join(", ")
      : null,
    clientDefaultTaxRateBps: row.clients?.default_tax_rate_bps ?? 0,
    clientDefaultTerms: row.clients?.default_terms ?? "due_on_receipt",
    clientDefaultPaymentMethod: row.clients?.default_payment_method ?? null,
    clientSavedPaymentMethodType: row.clients?.saved_payment_method_type ?? null,
    clientSavedPaymentMethodSummary: row.clients?.saved_payment_method_summary ?? null,
    clientAutopayEnabled: row.clients?.autopay_enabled ?? true,
    salesRepName: row.profiles?.name ?? null,
    clientInvoiceDelivery: row.clients?.invoice_delivery ?? "email",
    lineItems: (row.crm_invoice_line_items ?? []).map(mapLineItem),
    payments: (row.crm_payments ?? []).map(mapPayment),
  };
}

// ── queries ───────────────────────────────────────────────────────────────────

export function useInvoices(clientId?: string) {
  return useQuery({
    queryKey: ["crm-invoices", clientId ?? "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_invoices")
        .select("*, clients(display_name, billing_address, billing_city, billing_state, billing_zip, invoice_delivery, saved_payment_method_type, saved_payment_method_summary, autopay_enabled), profiles!crm_invoices_sales_rep_id_fkey(name), crm_invoice_line_items(id, name, description, total_cents, is_taxable)")
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data.map(mapInvoice) as CRMInvoice[];
    },
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
        .select("*, clients(display_name, primary_email, billing_address, billing_city, billing_state, billing_zip, default_tax_rate_bps, default_terms, default_payment_method, saved_payment_method_type, saved_payment_method_summary, autopay_enabled), profiles!crm_invoices_sales_rep_id_fkey(name), crm_invoice_line_items(*), crm_payments(*)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapInvoice(data);
    },
    enabled: !!id,
  });
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
        description: string; qty: number; rateCents: number; totalCents: number;
        discountCents?: number; discountType?: "percent" | "flat" | null; discountValue?: number | null;
      }[];
      subtotalCents: number;
      taxRateBps: number;
      taxCents: number;
      totalCents: number;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: client } = await (supabase as any)
        .from("clients")
        .select("default_payment_method")
        .eq("id", clientId)
        .single();
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
          due_date: dueDate ?? null,
          po_number: poNumber ?? null,
          subtotal_cents: subtotalCents,
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
            description: li.description,
            qty: li.qty,
            rate_cents: li.rateCents,
            total_cents: li.totalCents,
            discount_cents: li.discountCents ?? 0,
            discount_type: li.discountType ?? null,
            discount_value: li.discountValue ?? null,
            sort_order: i,
          }))
        );
        if (liErr) throw liErr;
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
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: client } = await (supabase as any)
        .from("clients")
        .select("default_payment_method")
        .eq("id", values.clientId)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: values.clientId,
          sales_rep_id: values.salesRepId ?? null,
          description: values.description,
          invoice_date: values.invoiceDate,
          due_date: values.dueDate ?? null,
          status: "draft",
          invoice_number: null, // number assigned explicitly on save, not on open
          preferred_payment_method: client?.default_payment_method ?? null,
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

export function useBulkImportInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: clients } = await (supabase as any)
        .from("clients")
        .select("id, display_name, default_payment_method")
        .is("deleted_at", null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byName = new Map((clients ?? []).map((c: any) => [c.display_name.trim().toLowerCase(), c.id]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaultPaymentMethodById = new Map((clients ?? []).map((c: any) => [c.id, c.default_payment_method ?? null]));

      let created = 0;
      let skipped = 0;

      for (const r of rows) {
        const clientId = byName.get(r.clientName?.trim().toLowerCase() ?? "");
        const amountCents = Math.round(parseFloat(r.amount || "0") * 100);
        if (!clientId || !r.description?.trim() || !amountCents) { skipped++; continue; }

        const taxCents = r.taxAmount ? Math.round(parseFloat(r.taxAmount) * 100) : 0;
        const totalCents = amountCents + taxCents;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoice, error } = await (supabase as any)
          .from("crm_invoices")
          .insert({
            created_by: user?.id ?? null,
            client_id: clientId,
            description: r.description.trim(),
            invoice_date: r.invoiceDate?.trim() || new Date().toISOString().split("T")[0],
            due_date: r.dueDate?.trim() || null,
            po_number: r.poNumber?.trim() || null,
            status: r.status?.trim().toLowerCase() || "draft",
            subtotal_cents: amountCents,
            tax_cents: taxCents,
            total_cents: totalCents,
            balance_cents: totalCents,
            preferred_payment_method: defaultPaymentMethodById.get(clientId) ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("assign_invoice_number", { p_invoice_id: invoice.id });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("crm_invoice_line_items").insert({
          invoice_id: invoice.id,
          description: r.description.trim(),
          qty: 1,
          rate_cents: amountCents,
          total_cents: amountCents,
        });
        created++;
      }

      return { created, skipped };
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ status: "void", balance_cents: 0 })
        .eq("id", id);
      if (error) throw error;
      // Re-sync the client's outstanding balance now that this invoice is excluded
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("sync_client_balance", { p_client_id: clientId });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inv } = await (supabase as any)
          .from("crm_invoices")
          .select("client_id")
          .eq("id", id)
          .single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_invoices")
          .update({ status, balance_cents: 0 })
          .eq("id", id);
        if (error) throw error;
        if (inv?.client_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("sync_client_balance", { p_client_id: inv.client_id });
        }
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
      };
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_invoices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}

// ── record payment ────────────────────────────────────────────────────────────

// ── shared invoice balance helper ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyPaymentToInvoice(supabase: any, invoiceId: string, deltaCents: number): Promise<{ newStatus: string; wasNewlyPaid: boolean }> {
  const { data: inv, error: invErr } = await supabase
    .from("crm_invoices")
    .select("total_cents, amount_paid_cents, status")
    .eq("id", invoiceId)
    .single();
  if (invErr) throw invErr;

  const newPaid = Math.max(0, inv.amount_paid_cents + deltaCents);
  const newBalance = Math.max(0, inv.total_cents - newPaid);
  const openStatus = inv.status === "printed" ? "printed" : "sent";
  const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : openStatus;

  const { error: updErr } = await supabase
    .from("crm_invoices")
    .update({ amount_paid_cents: newPaid, balance_cents: newBalance, status: newStatus })
    .eq("id", invoiceId);
  if (updErr) throw updErr;

  return { newStatus, wasNewlyPaid: newStatus === "paid" && inv.status !== "paid" };
}

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
      const { data: { user } } = await supabase.auth.getUser();
      const activeAllocations = (allocations ?? []).filter((a) => a.amountCents > 0);
      const primaryInvoiceId = activeAllocations.length === 1 ? activeAllocations[0].invoiceId : null;
      const allocatedCents = activeAllocations.reduce((s, a) => s + a.amountCents, 0);

      // insert payment row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: pmtErr } = await (supabase as any).from("crm_payments").insert({
        created_by: user?.id ?? null,
        invoice_id: primaryInvoiceId,
        client_id: clientId,
        amount_cents: amountCents,
        unused_amount_cents: amountCents - allocatedCents,
        payment_date: paymentDate,
        method,
        reference: reference ?? null,
        memo: memo ?? null,
        is_prepayment: isPrepayment ?? false,
        is_credit: isCredit ?? false,
      }).select("id").single();
      if (pmtErr) throw pmtErr;

      // apply to each allocated invoice, and record the exact split so it can
      // be reconstructed (not guessed) if this payment is edited later
      const newlyPaidInvoiceIds: string[] = [];
      for (const alloc of activeAllocations) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await applyPaymentToInvoice(supabase as any, alloc.invoiceId, alloc.amountCents);
        if (result.wasNewlyPaid) newlyPaidInvoiceIds.push(alloc.invoiceId);
      }
      if (activeAllocations.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: allocErr } = await (supabase as any).from("crm_payment_allocations").insert(
          activeAllocations.map((a) => ({
            payment_id: inserted.id,
            invoice_id: a.invoiceId,
            amount_cents: a.amountCents,
          }))
        );
        if (allocErr) throw allocErr;
      }

      // sync client balance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("sync_client_balance", { p_client_id: clientId });

      const refLabel = reference ? ` #${reference}` : "";
      const dateLabel = paymentDate ? ` on ${paymentDate}` : "";
      const label = isCredit
        ? `Account credit issued${memo ? `: ${memo}` : ""}${dateLabel}`
        : isPrepayment
          ? `Prepayment recorded: ${method}${refLabel}${dateLabel}`
          : activeAllocations.length > 0
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

      return { newlyPaidInvoiceIds };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
      for (const invoiceId of data?.newlyPaidInvoiceIds ?? []) {
        fireAutomationTrigger({ triggerType: "invoice_paid", clientId: vars.clientId, invoiceId });
      }
    },
  });
}

// ── update payment ────────────────────────────────────────────────────────────

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

      // Reverse the ORIGINAL allocations, not a guess. Historical payments
      // recorded before crm_payment_allocations existed fall back to the
      // single invoice_id the old code stored (only ever set for
      // single-invoice payments — multi-invoice payments predating this
      // table simply couldn't be reversed precisely; this is the best
      // recoverable behavior for that legacy data).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: oldAllocations, error: oldAllocErr } = await (supabase as any)
        .from("crm_payment_allocations")
        .select("invoice_id, amount_cents")
        .eq("payment_id", id);
      if (oldAllocErr) throw oldAllocErr;

      if (oldAllocations && oldAllocations.length > 0) {
        for (const a of oldAllocations as { invoice_id: string; amount_cents: number }[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await applyPaymentToInvoice(supabase as any, a.invoice_id, -a.amount_cents);
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: old, error: oldErr } = await (supabase as any)
          .from("crm_payments")
          .select("invoice_id, amount_cents")
          .eq("id", id)
          .single();
        if (oldErr) throw oldErr;
        if (old.invoice_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await applyPaymentToInvoice(supabase as any, old.invoice_id, -old.amount_cents);
        }
      }

      const activeAllocations = (allocations ?? []).filter((a) => a.amountCents > 0);
      const primaryInvoiceId = activeAllocations.length === 1 ? activeAllocations[0].invoiceId : null;
      const allocatedCents = activeAllocations.reduce((s, a) => s + a.amountCents, 0);

      // apply new allocations to invoices
      for (const alloc of activeAllocations) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await applyPaymentToInvoice(supabase as any, alloc.invoiceId, alloc.amountCents);
      }

      // update payment row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_payments").update({
        invoice_id: primaryInvoiceId,
        amount_cents: amountCents,
        unused_amount_cents: amountCents - allocatedCents,
        payment_date: paymentDate,
        method,
        reference: reference ?? null,
        memo: memo ?? null,
      }).eq("id", id);
      if (error) throw error;

      // replace allocation rows with the new split
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase as any).from("crm_payment_allocations").delete().eq("payment_id", id);
      if (delErr) throw delErr;
      if (activeAllocations.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: allocErr } = await (supabase as any).from("crm_payment_allocations").insert(
          activeAllocations.map((a) => ({
            payment_id: id,
            invoice_id: a.invoiceId,
            amount_cents: a.amountCents,
          }))
        );
        if (allocErr) throw allocErr;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("sync_client_balance", { p_client_id: clientId });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
      clientId,
      refundAmountCents,
      invoiceId,
    }: {
      id: string;
      clientId: string;
      refundAmountCents: number;
      invoiceId?: string | null;
    }) => {
      const supabase = createClient();

      // load current payment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pmt, error: pmtErr } = await (supabase as any)
        .from("crm_payments")
        .select("refunded_amount_cents, amount_cents")
        .eq("id", id)
        .single();
      if (pmtErr) throw pmtErr;

      const newRefunded = pmt.refunded_amount_cents + refundAmountCents;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_payments")
        .update({ refunded_amount_cents: newRefunded })
        .eq("id", id);
      if (error) throw error;

      // Reverse the refund across every invoice this payment was actually
      // allocated to, proportionally — a payment split across multiple
      // invoices has no single `invoiceId` (that field is only ever set for
      // single-invoice payments), so reversing just `invoiceId` silently
      // skipped every invoice for a split payment.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allocations } = await (supabase as any)
        .from("crm_payment_allocations")
        .select("invoice_id, amount_cents")
        .eq("payment_id", id);

      if (allocations && allocations.length > 0) {
        const totalAllocated = allocations.reduce((s: number, a: { amount_cents: number }) => s + a.amount_cents, 0);
        let remaining = refundAmountCents;
        for (let i = 0; i < allocations.length; i++) {
          const a = allocations[i];
          // Last row absorbs the rounding remainder so the sum always equals refundAmountCents exactly.
          const share = i === allocations.length - 1
            ? remaining
            : Math.round((refundAmountCents * a.amount_cents) / totalAllocated);
          remaining -= share;
          if (share > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await applyPaymentToInvoice(supabase as any, a.invoice_id, -share);
          }
        }
      } else if (invoiceId) {
        // Legacy payment predating crm_payment_allocations.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await applyPaymentToInvoice(supabase as any, invoiceId, -refundAmountCents);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("sync_client_balance", { p_client_id: clientId });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        client_id: clientId,
        activity_type: "payment",
        subject: `Refund issued: ${formatCents(refundAmountCents)}`,
        ref_id: id,
        ref_table: "crm_payments",
        amount_cents: -refundAmountCents,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── upsert line item ──────────────────────────────────────────────────────────

export function useUpsertInvoiceLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      item,
    }: {
      invoiceId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item: Record<string, any>;
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
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_invoice_line_items")
          .insert({ invoice_id: invoiceId, ...item });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.invoiceId] }),
  });
}

// Shared by useDeleteInvoiceLineItem and useSetJobProductStatus (removing a
// job product from an invoice deletes its line item the same way).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteInvoiceLineItemAndRecalc(supabase: any, id: string, invoiceId: string) {
  // Delete the line item
  const { error } = await supabase
    .from("crm_invoice_line_items")
    .delete()
    .eq("id", id);
  if (error) throw error;

  // Recalculate invoice totals from remaining line items
  const { data: inv } = await supabase
    .from("crm_invoices")
    .select("amount_paid_cents, tax_rate_bps, discount_cents, client_id")
    .eq("id", invoiceId)
    .single();
  const { data: items } = await supabase
    .from("crm_invoice_line_items")
    .select("total_cents, discount_cents, is_taxable")
    .eq("invoice_id", invoiceId);

  // Net of each line's own discount — matches useUpdateInvoiceFinancials'
  // netLineCents so a delete recomputes the same way an edit would.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const netLineCents = (li: any) => li.total_cents - (li.discount_cents ?? 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtotalCents = (items ?? []).reduce((s: number, li: any) => s + netLineCents(li), 0);
  const discountCents = inv?.discount_cents ?? 0;
  const taxRateBps = inv?.tax_rate_bps ?? 0;
  const afterDiscount = subtotalCents - discountCents;
  // Tax only applies to taxable line items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxableBase = (items ?? []).filter((li: any) => li.is_taxable).reduce((s: number, li: any) => s + netLineCents(li), 0);
  const taxCents = Math.round((taxableBase * taxRateBps) / 10000);
  const totalCents = afterDiscount + taxCents;
  const paid = inv?.amount_paid_cents ?? 0;
  const balanceCents = Math.max(0, totalCents - paid);

  await supabase.from("crm_invoices").update({
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    balance_cents: balanceCents,
  }).eq("id", invoiceId);

  // Sync client's outstanding balance
  if (inv?.client_id) {
    await supabase.rpc("sync_client_balance", { p_client_id: inv.client_id });
  }

  return { invoiceId, clientId: inv?.client_id as string | undefined };
}

export function useDeleteInvoiceLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient();
      return deleteInvoiceLineItemAndRecalc(supabase, id, invoiceId);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.invoiceId] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
      // discount is a separate reduction stacked on top of that.
      const netLineCents = (li: InvoiceLineItem) => li.totalCents - li.discountCents;
      const subtotalCents = lineItems.reduce((s, li) => s + netLineCents(li), 0);
      const afterDiscount = subtotalCents - discountCents;
      // Tax only applies to taxable line items
      const taxableBase = lineItems.filter((li) => li.isTaxable).reduce((s, li) => s + netLineCents(li), 0);
      const taxCents = Math.round((taxableBase * taxRateBps) / 10000);
      const totalCents = afterDiscount + taxCents;
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inv } = await (supabase as any)
        .from("crm_invoices")
        .select("amount_paid_cents, client_id")
        .eq("id", id)
        .single();
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
      if (error) throw error;

      // Sync client's outstanding balance
      if (inv?.client_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("sync_client_balance", { p_client_id: inv.client_id });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
  "Credit Card- Visa", "Other",
];

export function useBulkImportPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data: clients } = await supabase.from("clients").select("id, display_name").is("deleted_at", null);
      const byName = new Map((clients ?? []).map((c) => [c.display_name.trim().toLowerCase(), c.id]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: invoices } = await (supabase as any).from("crm_invoices").select("id, invoice_number, client_id").is("deleted_at", null);
      const invoiceByNumberAndClient = new Map<string, string>(
        (invoices ?? [])
          .filter((i: { invoice_number: number | null }) => i.invoice_number != null)
          .map((i: { invoice_number: number; client_id: string; id: string }): [string, string] => [`${i.client_id}:${i.invoice_number}`, i.id])
      );

      let created = 0;
      let skipped = 0;

      for (const r of rows) {
        const clientId = byName.get(r.clientName?.trim().toLowerCase() ?? "");
        const amountCents = Math.round(parseFloat(r.amount || "0") * 100);
        if (!clientId || !amountCents) { skipped++; continue; }

        const method = PAYMENT_METHODS.find((m) => m.toLowerCase() === r.method?.trim().toLowerCase()) ?? "Check";
        const invoiceNumber = r.invoiceNumber ? parseInt(r.invoiceNumber, 10) : null;
        const invoiceId = invoiceNumber ? invoiceByNumberAndClient.get(`${clientId}:${invoiceNumber}`) ?? null : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: payment, error } = await (supabase as any).from("crm_payments").insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          invoice_id: invoiceId,
          amount_cents: amountCents,
          unused_amount_cents: invoiceId ? 0 : amountCents,
          payment_date: r.paymentDate?.trim() || new Date().toISOString().split("T")[0],
          method,
          reference: r.reference?.trim() || null,
          memo: r.memo?.trim() || null,
        }).select("id").single();
        if (error) throw error;

        if (invoiceId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("crm_payment_allocations").insert({
            payment_id: payment.id,
            invoice_id: invoiceId,
            amount_cents: amountCents,
          });
          await applyPaymentToInvoice(supabase, invoiceId, amountCents);
        }
        created++;
      }

      return { created, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}

export function usePayments(clientId?: string) {
  return useQuery({
    queryKey: ["crm-payments", clientId ?? "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_payments")
        .select("*, clients(display_name, billing_address), crm_invoices(invoice_number)")
        .is("deleted_at", null)
        .order("payment_date", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data.map(mapPaymentFull) as CRMPayment[];
    },
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
        .select("*, clients(display_name, billing_address), crm_invoices(invoice_number)")
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

// ── create invoice from a completed job ───────────────────────────────────────

export function useCreateInvoiceFromJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      clientId,
      description,
      invoiceDate,
      dueDate,
      poNumber,
      lineItems,
      subtotalCents,
      taxRateBps,
      taxCents,
      totalCents,
    }: {
      jobId: string;
      clientId: string;
      description: string;
      invoiceDate: string;
      dueDate?: string;
      poNumber?: string | null;
      lineItems: {
        name?: string;
        description: string;
        qty: number;
        rateCents: number;
        totalCents: number;
        serviceDate?: string | null;
        // Present only for line items sourced from a job Product — links the
        // invoice line back to the catalog product and flips the source
        // crm_job_products row to 'invoiced' (decrementing inventory if the
        // product tracks it) once the invoice is created.
        productId?: string | null;
        jobProductId?: string | null;
      }[];
      subtotalCents: number;
      taxRateBps: number;
      taxCents: number;
      totalCents: number;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: job } = await (supabase as any)
        .from("crm_jobs")
        .select("sales_rep_id")
        .eq("id", jobId)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          crm_job_id: jobId,
          sales_rep_id: job?.sales_rep_id ?? null,
          description,
          invoice_date: invoiceDate,
          due_date: dueDate ?? null,
          po_number: poNumber ?? null,
          status: "draft",
          subtotal_cents: subtotalCents,
          tax_rate_bps: taxRateBps,
          tax_cents: taxCents,
          total_cents: totalCents,
          balance_cents: totalCents,
        })
        .select()
        .single();
      if (error) throw error;

      const invoiceId = (data as { id: string }).id;

      if (lineItems.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertedLineItems, error: liError } = await (supabase as any)
          .from("crm_invoice_line_items")
          .insert(
            lineItems.map((li, i) => ({
              invoice_id: invoiceId,
              name: li.name ?? null,
              description: li.description,
              qty: li.qty,
              rate_cents: li.rateCents,
              total_cents: li.totalCents,
              service_date: li.serviceDate ?? null,
              product_id: li.productId ?? null,
              sort_order: i,
            }))
          )
          .select("id");
        if (liError) throw liError;

        // Line items sourced from a job Product: link the invoice line back
        // to the job product row and flip it to 'invoiced' via
        // set_job_product_status(), which decrements product_items.quantity_on_hand
        // server-side when that product tracks inventory.
        const productLinks = lineItems
          .map((li, i) => ({ li, insertedId: (insertedLineItems as { id: string }[] | null)?.[i]?.id }))
          .filter((x) => x.li.jobProductId && x.insertedId);
        await Promise.all(
          productLinks.map(async ({ li, insertedId }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("crm_job_products")
              .update({ invoice_line_item_id: insertedId })
              .eq("id", li.jobProductId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("set_job_product_status", {
              p_job_product_id: li.jobProductId,
              p_new_status: "invoiced",
            });
          })
        );
      }

      // tag the job as invoiced
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_jobs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ sub_status: "invoiced" } as any)
        .eq("id", jobId);

      // log to client activity timeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        client_id: clientId,
        activity_type: "invoice",
        subject: `Invoice #${data.invoice_number}`,
        amount_cents: data.total_cents ?? 0,
        ref_id: invoiceId,
        ref_table: "crm_invoices",
      });

      return mapInvoice(data);
    },
    onSuccess: (invoice, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
      qc.invalidateQueries({ queryKey: ["crm-job-products", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["crm-job-detail"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      fireAutomationTrigger({ triggerType: "invoice_created", clientId: vars.clientId, invoiceId: invoice.id });
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
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}
