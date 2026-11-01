// Resolves which Estimate-type document (the proposal layout) applies to an
// estimate. Precedence: estimates.document_template_id (explicit pick, or
// stamped there when a bundle with a linked document was applied) -> the org's
// default active estimate document -> null (built-in layout / today's flow).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface ResolvedEstimateDocumentBlock {
  id: string;
  block_type: string;
  content: string | null;
  settings: Record<string, unknown> | null;
  order_index: number;
}

export interface ResolvedEstimateDocument {
  id: string;
  org_id: string;
  name: string;
  subject: string | null;
  doc_type: "estimate";
  status: string;
  is_default: boolean;
  include_pdf: boolean;
  estimate_email_document_id: string | null;
  confirmation_document_id: string | null;
  confirmation_recipient: "primary_email" | "billing_email";
  confirmation_include_estimate_pdf: boolean;
  blocks: ResolvedEstimateDocumentBlock[];
}

const DOC_COLUMNS =
  "id, org_id, name, subject, doc_type, status, is_default, include_pdf, estimate_email_document_id, " +
  "confirmation_document_id, confirmation_recipient, confirmation_include_estimate_pdf";

async function loadActiveEstimateDoc(
  supabase: AnySupabase,
  orgId: string,
  filter: { id: string } | { isDefault: true },
) {
  let q = supabase
    .from("crm_document_templates")
    .select(DOC_COLUMNS)
    .eq("org_id", orgId)
    .eq("doc_type", "estimate")
    .eq("status", "active")
    .is("deleted_at", null);
  q = "id" in filter ? q.eq("id", filter.id) : q.eq("is_default", true).order("updated_at", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  return (data as Omit<ResolvedEstimateDocument, "blocks"> | null) ?? null;
}

/** Returns the resolved estimate document with its blocks, or null. Never throws. */
export async function resolveEstimateDocument(
  supabase: AnySupabase,
  estimateId: string,
): Promise<ResolvedEstimateDocument | null> {
  try {
    const { data: est } = await supabase
      .from("estimates")
      .select("org_id, document_template_id")
      .eq("id", estimateId)
      .maybeSingle();
    if (!est) return null;
    const orgId = est.org_id as string;

    let doc = est.document_template_id
      ? await loadActiveEstimateDoc(supabase, orgId, { id: est.document_template_id as string })
      : null;
    if (!doc) doc = await loadActiveEstimateDoc(supabase, orgId, { isDefault: true });
    if (!doc) return null;

    const { data: blocks } = await supabase
      .from("crm_document_blocks")
      .select("id, block_type, content, settings, order_index")
      .eq("template_id", doc.id)
      .order("order_index", { ascending: true });

    return { ...doc, blocks: (blocks ?? []) as ResolvedEstimateDocumentBlock[] };
  } catch {
    return null;
  }
}
