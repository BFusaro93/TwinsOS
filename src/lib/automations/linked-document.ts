import {
  renderBlocksToHtml,
  renderBlocksToPlainText,
  type RenderableBlock,
} from "@/lib/utils/document-template-renderer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface LinkedDocument {
  name: string;
  subject: string | null;
  blocks: RenderableBlock[];
}

/**
 * Loads the document an automation step is linked to — current text, not a copy
 * taken when the step was saved, so editing the document updates every step that
 * uses it. Scoped to the step's own org (the caller runs on the service client,
 * so RLS does not do it) and ignores a deleted document. Null = no link, or the
 * document is gone / empty, and the caller falls back to the step's own text.
 */
export async function loadLinkedDocument(
  supabase: AnyClient,
  params: { orgId: string; templateId: unknown },
): Promise<LinkedDocument | null> {
  const id = typeof params.templateId === "string" ? params.templateId.trim() : "";
  if (!id) return null;

  const { data: tpl } = await supabase
    .from("crm_document_templates")
    .select("id, name, subject")
    .eq("id", id)
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tpl) return null;

  const { data: blocks } = await supabase
    .from("crm_document_blocks")
    .select("block_type, content, settings, order_index")
    .eq("template_id", id)
    .eq("org_id", params.orgId)
    .order("order_index", { ascending: true });

  const renderable: RenderableBlock[] = ((blocks ?? []) as Array<{
    block_type: RenderableBlock["blockType"];
    content: string | null;
    settings: Record<string, unknown> | null;
  }>).map((b) => ({ blockType: b.block_type, content: b.content ?? null, settings: b.settings ?? {} }));

  return { name: tpl.name as string, subject: (tpl.subject as string | null) ?? null, blocks: renderable };
}

/** True when a document has nothing to send (no blocks with visible content). */
export function linkedDocumentIsEmpty(doc: LinkedDocument): boolean {
  return !doc.blocks.some((b) => (b.content ?? "").replace(/<[^>]*>/g, "").trim().length > 0 || b.blockType === "image" || b.blockType === "line_items");
}

/**
 * Email content from a linked document: subject plus body HTML with merge tags
 * left unresolved, so resolveEmailStepContent fills them in per recipient
 * exactly as it does for a body typed into the step. Null when the document is
 * missing or empty.
 */
export function emailContentFromDocument(doc: LinkedDocument | null): { subject: string | null; bodyHtml: string } | null {
  if (!doc || linkedDocumentIsEmpty(doc)) return null;
  return {
    subject: doc.subject?.trim() || null,
    bodyHtml: renderBlocksToHtml(doc.blocks, {}, { preserveUnresolvedKnownTags: true }),
  };
}

/** Plain-text body from a linked document (ticket description). Null when missing or empty. */
export function plainTextFromDocument(doc: LinkedDocument | null): string | null {
  if (!doc) return null;
  const text = renderBlocksToPlainText(doc.blocks);
  return text.trim() ? text : null;
}
