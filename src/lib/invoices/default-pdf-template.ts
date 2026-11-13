import type { SupabaseClient } from "@supabase/supabase-js";

export const INVOICE_PDF_TEMPLATE_COLUMNS =
  "layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text, show_chemical_applications, show_visit_notes";

/**
 * The org's fallback invoice PDF template when an invoice isn't pinned to one.
 *
 * Prefers the template flagged `is_default`; if none is flagged (a new org that
 * only ever created templates, never starred one) it falls back to the first by
 * name — the same one the send dialog pre-selects — so the emailed PDF, the
 * printed PDF and the customer portal all render the layout the user saw
 * selected, instead of the built-in layout. Also tolerates two rows flagged
 * default (maybeSingle() would error and silently yield "no template").
 */
export async function resolveDefaultInvoicePdfTemplate(
  supabase: SupabaseClient,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const { data } = await supabase
    .from("crm_invoice_pdf_templates")
    .select(INVOICE_PDF_TEMPLATE_COLUMNS)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })
    .limit(1);
  return data?.[0] ?? null;
}
