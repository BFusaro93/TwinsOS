"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
    isTaxable: row.is_taxable ?? false,
    sortOrder: row.sort_order,
    serviceDate: row.service_date ?? null,
    hours: row.hours != null ? Number(row.hours) : null,
    men: row.men ?? null,
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
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInvoice(row: any): CRMInvoice {
  return {
    id: row.id,
    orgId: row.org_id,
    invoiceNumber: row.invoice_number,
    clientId: row.client_id,
    estimateId: row.estimate_id,
    crmJobId: row.crm_job_id,
    description: row.description,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    poNumber: row.po_number,
    terms: row.terms ?? null,
    serviceAddress: row.service_address ?? null,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    taxRateBps: row.tax_rate_bps,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    amountPaidCents: row.amount_paid_cents,
    balanceCents: row.balance_cents,
    notes: row.notes,
    locked: row.locked ?? false,
    lockedAt: row.locked_at ?? null,
    preferredPaymentMethod: row.preferred_payment_method ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
    clientAddress: row.clients
      ? [row.clients.billing_address, row.clients.billing_city, row.clients.billing_state, row.clients.billing_zip]
          .filter(Boolean).join(", ")
      : null,
    clientDefaultTaxRateBps: row.clients?.default_tax_rate_bps ?? 0,
    clientDefaultTerms: row.clients?.default_terms ?? "due_on_receipt",
    clientDefaultPaymentMethod: row.clients?.default_payment_method ?? null,
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
        .select("*, clients(display_name), crm_invoice_line_items(id, name, description, total_cents, is_taxable)")
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
        .select("*, clients(display_name, billing_address, billing_city, billing_state, billing_zip, default_tax_rate_bps, default_terms, default_payment_method), crm_invoice_line_items(*), crm_payments(*)")
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
      description: string;
      invoiceDate: string;
      dueDate?: string;
      poNumber?: string | null;
      lineItems: { description: string; qty: number; rateCents: number; totalCents: number }[];
      subtotalCents: number;
      taxRateBps: number;
      taxCents: number;
      totalCents: number;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inv, error: invErr } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          estimate_id: estimateId,
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
            sort_order: i,
          }))
        );
        if (liErr) throw liErr;
      }

      return mapInvoice(inv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}

// ── create blank ──────────────────────────────────────────────────────────────

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      clientId: string;
      description: string;
      invoiceDate: string;
      dueDate?: string;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: values.clientId,
          description: values.description,
          invoice_date: values.invoiceDate,
          due_date: values.dueDate ?? null,
          status: "draft",
          invoice_number: null, // number assigned explicitly on save, not on open
        })
        .select()
        .single();
      if (error) throw error;
      return mapInvoice(data);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

// ── assign invoice number (called on explicit save of a draft) ────────────────

export function useAssignInvoiceNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-invoices"] }),
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
async function applyPaymentToInvoice(supabase: any, invoiceId: string, deltaCents: number) {
  const { data: inv, error: invErr } = await supabase
    .from("crm_invoices")
    .select("total_cents, amount_paid_cents")
    .eq("id", invoiceId)
    .single();
  if (invErr) throw invErr;

  const newPaid = Math.max(0, inv.amount_paid_cents + deltaCents);
  const newBalance = Math.max(0, inv.total_cents - newPaid);
  const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : "sent";

  const { error: updErr } = await supabase
    .from("crm_invoices")
    .update({ amount_paid_cents: newPaid, balance_cents: newBalance, status: newStatus })
    .eq("id", invoiceId);
  if (updErr) throw updErr;
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
      allocations,
    }: {
      clientId: string;
      amountCents: number;
      paymentDate: string;
      method: string;
      reference?: string;
      memo?: string;
      isPrepayment?: boolean;
      allocations?: { invoiceId: string; amountCents: number }[];
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const activeAllocations = (allocations ?? []).filter((a) => a.amountCents > 0);
      const primaryInvoiceId = activeAllocations.length === 1 ? activeAllocations[0].invoiceId : null;

      // insert payment row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: pmtErr } = await (supabase as any).from("crm_payments").insert({
        created_by: user?.id ?? null,
        invoice_id: primaryInvoiceId,
        client_id: clientId,
        amount_cents: amountCents,
        payment_date: paymentDate,
        method,
        reference: reference ?? null,
        memo: memo ?? null,
        is_prepayment: isPrepayment ?? false,
      }).select("id").single();
      if (pmtErr) throw pmtErr;

      // apply to each allocated invoice, and record the exact split so it can
      // be reconstructed (not guessed) if this payment is edited later
      for (const alloc of activeAllocations) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await applyPaymentToInvoice(supabase as any, alloc.invoiceId, alloc.amountCents);
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

      const label = isPrepayment
        ? `Prepayment recorded: ${method}`
        : activeAllocations.length > 0
          ? `Payment received: ${method}`
          : `Payment recorded: ${method}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        client_id: clientId,
        activity_type: "payment",
        subject: label,
        ref_id: primaryInvoiceId,
        ref_table: primaryInvoiceId ? "crm_invoices" : null,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
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

      // reverse allocation on invoice if linked
      if (invoiceId) {
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
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoice_line_items")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ invoice_id: invoiceId, ...item } as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", vars.invoiceId] }),
  });
}

export function useDeleteInvoiceLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient();
      // Delete the line item
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoice_line_items")
        .delete()
        .eq("id", id);
      if (error) throw error;

      // Recalculate invoice totals from remaining line items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inv } = await (supabase as any)
        .from("crm_invoices")
        .select("amount_paid_cents, tax_rate_bps, discount_cents, client_id")
        .eq("id", invoiceId)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: items } = await (supabase as any)
        .from("crm_invoice_line_items")
        .select("total_cents, is_taxable")
        .eq("invoice_id", invoiceId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subtotalCents = (items ?? []).reduce((s: number, li: any) => s + li.total_cents, 0);
      const discountCents = inv?.discount_cents ?? 0;
      const taxRateBps = inv?.tax_rate_bps ?? 0;
      const afterDiscount = subtotalCents - discountCents;
      // Tax only applies to taxable line items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taxableBase = (items ?? []).filter((li: any) => li.is_taxable).reduce((s: number, li: any) => s + li.total_cents, 0);
      const taxCents = Math.round((taxableBase * taxRateBps) / 10000);
      const totalCents = afterDiscount + taxCents;
      const paid = inv?.amount_paid_cents ?? 0;
      const balanceCents = Math.max(0, totalCents - paid);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("crm_invoices").update({
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        balance_cents: balanceCents,
      }).eq("id", invoiceId);

      // Sync client's outstanding balance
      if (inv?.client_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("sync_client_balance", { p_client_id: inv.client_id });
      }

      return { invoiceId, clientId: inv?.client_id };
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
      terms,
    }: {
      id: string;
      lineItems: InvoiceLineItem[];
      taxRateBps: number;
      discountCents: number;
      terms?: string | null;
    }) => {
      const subtotalCents = lineItems.reduce((s, li) => s + li.totalCents, 0);
      const afterDiscount = subtotalCents - discountCents;
      // Tax only applies to taxable line items
      const taxableBase = lineItems.filter((li) => li.isTaxable).reduce((s, li) => s + li.totalCents, 0);
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
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
    clientAddress: row.clients?.billing_address ?? null,
    invoiceNumber: row.crm_invoices?.invoice_number ?? null,
  };
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
      lineItems: { description: string; qty: number; rateCents: number; totalCents: number }[];
      subtotalCents: number;
      taxRateBps: number;
      taxCents: number;
      totalCents: number;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoices")
        .insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          description,
          invoice_date: invoiceDate,
          due_date: dueDate ?? null,
          po_number: poNumber ?? null,
          status: "draft",
          subtotal_cents: subtotalCents,
          tax_rate_bps: taxRateBps,
          tax_cents: taxCents,
          total_cents: totalCents,
        })
        .select()
        .single();
      if (error) throw error;

      const invoiceId = (data as { id: string }).id;

      if (lineItems.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("crm_invoice_line_items").insert(
          lineItems.map((li, i) => ({
            invoice_id: invoiceId,
            description: li.description,
            qty: li.qty,
            rate_cents: li.rateCents,
            total_cents: li.totalCents,
            sort_order: i,
          }))
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
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
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
