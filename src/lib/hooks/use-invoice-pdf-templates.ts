"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { InvoicePDFTemplate, InvoicePDFLayoutKey } from "@/types/crm-invoices";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(row: any): InvoicePDFTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    layoutKey: row.layout_key as InvoicePDFLayoutKey,
    isDefault: row.is_default ?? false,
    logoUrl: row.logo_url ?? null,
    accentColor: row.accent_color ?? null,
    showNotes: row.show_notes ?? true,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
  };
}

export function useInvoicePDFTemplates() {
  return useQuery({
    queryKey: ["crm-invoice-pdf-templates"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoice_pdf_templates")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapTemplate)) as InvoicePDFTemplate[];
    },
  });
}

export function useCreateInvoicePDFTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; layoutKey: InvoicePDFLayoutKey }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_invoice_pdf_templates")
        .insert({ name: values.name, layout_key: values.layoutKey })
        .select()
        .single();
      if (error) throw error;
      return mapTemplate(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-invoice-pdf-templates"] }),
  });
}

export function useUpdateInvoicePDFTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      layoutKey,
      logoUrl,
      accentColor,
      showNotes,
    }: {
      id: string;
      name?: string;
      layoutKey?: InvoicePDFLayoutKey;
      logoUrl?: string | null;
      accentColor?: string | null;
      showNotes?: boolean;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (layoutKey !== undefined) updates.layout_key = layoutKey;
      if (logoUrl !== undefined) updates.logo_url = logoUrl;
      if (accentColor !== undefined) updates.accent_color = accentColor;
      if (showNotes !== undefined) updates.show_notes = showNotes;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoice_pdf_templates")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-invoice-pdf-templates"] }),
  });
}

/** Sets one template as the org default — clears the flag off any other
 *  template first since only one can be default (enforced by a partial unique index). */
export function useSetDefaultInvoicePDFTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: clearErr } = await (supabase as any)
        .from("crm_invoice_pdf_templates")
        .update({ is_default: false })
        .eq("is_default", true)
        .neq("id", id);
      if (clearErr) throw clearErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoice_pdf_templates")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-invoice-pdf-templates"] }),
  });
}

export function useDeleteInvoicePDFTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoice_pdf_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-invoice-pdf-templates"] }),
  });
}

export function useSetInvoicePDFTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, templateId }: { invoiceId: string; templateId: string | null }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_invoices")
        .update({ pdf_template_id: templateId })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices", "detail", invoiceId] });
    },
  });
}
