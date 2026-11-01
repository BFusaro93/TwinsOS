"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/supabase";
import type {
  DocumentTemplate,
  DocumentBlock,
  DocumentTemplateWithBlocks,
  DocType,
  DocStatus,
  BlockType,
  ConfirmationRecipient,
} from "@/types/crm-documents";

import { toDisplaySettings, type DisplaySettings } from "@/lib/estimate-display-settings";

const supabase = createClient();

// The estimate-settings columns arrive with migration 20261202000300 and are not
// in the generated types until `supabase gen types` is re-run; extend locally so
// the hooks compile either way (intersection is harmless once they exist).
interface EstimateSettingsColumns {
  estimate_email_document_id: string | null;
  confirmation_document_id: string | null;
  confirmation_recipient: string | null;
  confirmation_include_estimate_pdf: boolean | null;
  display_settings: unknown | null;
}
type TemplateRow = Database["public"]["Tables"]["crm_document_templates"]["Row"] &
  Partial<EstimateSettingsColumns>;
type TemplateUpdate = Database["public"]["Tables"]["crm_document_templates"]["Update"] &
  Partial<EstimateSettingsColumns>;
type BlockRow = Database["public"]["Tables"]["crm_document_blocks"]["Row"];

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapTemplate(row: TemplateRow): DocumentTemplate {
  return {
    id:          row.id,
    orgId:       row.org_id,
    name:        row.name,
    docType:     row.doc_type as DocType,
    description: row.description ?? null,
    subject:     row.subject ?? null,
    status:      row.status as DocStatus,
    isDefault:   row.is_default,
    includePdf:  row.include_pdf,
    estimateEmailDocumentId: row.estimate_email_document_id ?? null,
    confirmationDocumentId:  row.confirmation_document_id ?? null,
    confirmationRecipient:   (row.confirmation_recipient === "billing_email" ? "billing_email" : "primary_email") as ConfirmationRecipient,
    confirmationIncludeEstimatePdf: row.confirmation_include_estimate_pdf === true,
    displaySettings: row.display_settings ? toDisplaySettings(row.display_settings) : null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

function mapBlock(row: BlockRow): DocumentBlock {
  return {
    id:          row.id,
    templateId:  row.template_id,
    orgId:       row.org_id,
    blockType:   row.block_type as BlockType,
    orderIndex:  row.order_index,
    content:     row.content ?? null,
    settings:    (row.settings ?? {}) as Record<string, unknown>,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useDocumentTemplates() {
  return useQuery({
    queryKey: ["crm-document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_document_templates")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data.map(mapTemplate);
    },
  });
}

// ── Single with blocks ────────────────────────────────────────────────────────

export function useDocumentTemplate(id: string) {
  return useQuery({
    queryKey: ["crm-document-template", id],
    queryFn: async () => {
      const [{ data: tpl, error: tplErr }, { data: blocks, error: blkErr }] =
        await Promise.all([
          supabase.from("crm_document_templates").select("*").eq("id", id).single(),
          supabase
            .from("crm_document_blocks")
            .select("*")
            .eq("template_id", id)
            .order("order_index", { ascending: true }),
        ]);
      if (tplErr) throw tplErr;
      if (blkErr) throw blkErr;
      return {
        ...mapTemplate(tpl),
        blocks: (blocks ?? []).map(mapBlock),
      } as DocumentTemplateWithBlocks;
    },
    enabled: !!id,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      docType: DocType;
      description?: string;
      subject?: string;
      includePdf?: boolean;
      estimateEmailDocumentId?: string | null;
      confirmationDocumentId?: string | null;
      confirmationRecipient?: ConfirmationRecipient;
      confirmationIncludeEstimatePdf?: boolean;
      displaySettings?: DisplaySettings | null;
      /** Optional starter blocks inserted right after the template is created. */
      blocks?: Array<{
        blockType: BlockType;
        orderIndex: number;
        content: string | null;
        settings: Record<string, unknown>;
      }>;
    }) => {
      const isEstimate = input.docType === "estimate";
      const estimateCols: Partial<EstimateSettingsColumns> = isEstimate
        ? {
            estimate_email_document_id: input.estimateEmailDocumentId ?? null,
            confirmation_document_id: input.confirmationDocumentId ?? null,
            confirmation_recipient: input.confirmationRecipient ?? "primary_email",
            confirmation_include_estimate_pdf: input.confirmationIncludeEstimatePdf ?? false,
            display_settings: input.displaySettings ?? null,
          }
        : {};
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user!.id)
        .single();

      const { data, error } = await supabase
        .from("crm_document_templates")
        .insert({
          org_id:      profile!.org_id,
          name:        input.name,
          doc_type:    input.docType,
          description: input.description ?? null,
          subject:     input.subject ?? null,
          ...(input.includePdf !== undefined ? { include_pdf: input.includePdf } : {}),
          ...estimateCols,
          created_by:  user!.id,
        } as Database["public"]["Tables"]["crm_document_templates"]["Insert"])
        .select()
        .single();
      if (error) throw error;

      if (input.blocks && input.blocks.length > 0) {
        const { error: blocksErr } = await supabase.from("crm_document_blocks").insert(
          input.blocks.map((b) => ({
            template_id: data.id,
            org_id:      profile!.org_id,
            block_type:  b.blockType,
            order_index: b.orderIndex,
            content:     b.content,
            settings:    b.settings as Json,
          }))
        );
        if (blocksErr) {
          // Don't leave an empty shell behind.
          await supabase
            .from("crm_document_templates")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", data.id);
          throw blocksErr;
        }
      }
      return mapTemplate(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-document-templates"] }),
  });
}

// ── Duplicate ─────────────────────────────────────────────────────────────────

/**
 * Copies a document template and its blocks as "<name> (Copy)". The copy keeps
 * the source's status but is never the default (one default per type). Image
 * blocks keep pointing at the same public files in the document-images bucket;
 * deleting a document never removes those files, so sharing them is safe.
 */
export function useDuplicateDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const [{ data: src, error: srcErr }, { data: blocks, error: blkErr }] = await Promise.all([
        supabase.from("crm_document_templates").select("*").eq("id", sourceId).is("deleted_at", null).single(),
        supabase.from("crm_document_blocks").select("*").eq("template_id", sourceId).order("order_index", { ascending: true }),
      ]);
      if (srcErr) throw srcErr;
      if (blkErr) throw blkErr;

      const { data: created, error: insErr } = await supabase
        .from("crm_document_templates")
        .insert({
          org_id:      src.org_id,
          name:        `${src.name} (Copy)`,
          doc_type:    src.doc_type,
          description: src.description,
          subject:     src.subject,
          status:      src.status,
          is_default:  false,
          include_pdf: src.include_pdf,
          ...(src.doc_type === "estimate"
            ? {
                estimate_email_document_id: (src as TemplateRow).estimate_email_document_id ?? null,
                confirmation_document_id: (src as TemplateRow).confirmation_document_id ?? null,
                confirmation_recipient: (src as TemplateRow).confirmation_recipient ?? "primary_email",
                confirmation_include_estimate_pdf: (src as TemplateRow).confirmation_include_estimate_pdf ?? false,
                display_settings: (src as TemplateRow).display_settings ?? null,
              }
            : {}),
          created_by:  user.id,
        } as Database["public"]["Tables"]["crm_document_templates"]["Insert"])
        .select()
        .single();
      if (insErr) throw insErr;

      if ((blocks ?? []).length > 0) {
        const { error: blocksErr } = await supabase.from("crm_document_blocks").insert(
          (blocks ?? []).map((b) => ({
            template_id: created.id,
            org_id:      src.org_id,
            block_type:  b.block_type,
            order_index: b.order_index,
            content:     b.content,
            settings:    b.settings,
          }))
        );
        if (blocksErr) {
          // Don't leave an empty shell behind.
          await supabase
            .from("crm_document_templates")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", created.id);
          throw blocksErr;
        }
      }
      return mapTemplate(created);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-document-templates"] }),
  });
}

// ── Update template meta ──────────────────────────────────────────────────────

export function useUpdateDocumentTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<{
      name: string;
      docType: DocType;
      description: string | null;
      subject: string | null;
      status: DocStatus;
      isDefault: boolean;
      includePdf: boolean;
      estimateEmailDocumentId: string | null;
      confirmationDocumentId: string | null;
      confirmationRecipient: ConfirmationRecipient;
      confirmationIncludeEstimatePdf: boolean;
      displaySettings: DisplaySettings | null;
    }>) => {
      const payload: TemplateUpdate = {};
      if (updates.name        !== undefined) payload.name        = updates.name;
      if (updates.docType     !== undefined) payload.doc_type    = updates.docType;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.subject     !== undefined) payload.subject     = updates.subject;
      if (updates.status      !== undefined) payload.status      = updates.status;
      if (updates.isDefault   !== undefined) payload.is_default  = updates.isDefault;
      if (updates.includePdf  !== undefined) payload.include_pdf = updates.includePdf;
      if (updates.estimateEmailDocumentId !== undefined) payload.estimate_email_document_id = updates.estimateEmailDocumentId;
      if (updates.confirmationDocumentId  !== undefined) payload.confirmation_document_id  = updates.confirmationDocumentId;
      if (updates.confirmationRecipient   !== undefined) payload.confirmation_recipient    = updates.confirmationRecipient;
      if (updates.confirmationIncludeEstimatePdf !== undefined) payload.confirmation_include_estimate_pdf = updates.confirmationIncludeEstimatePdf;
      if (updates.displaySettings !== undefined) payload.display_settings = updates.displaySettings as unknown as null;

      const { error } = await supabase
        .from("crm_document_templates")
        .update(payload as Database["public"]["Tables"]["crm_document_templates"]["Update"])
        .eq("id", id);
      if (error) throw error;

      // One default per document type. Nothing enforces it in the database, so
      // ticking "default" on a second template left BOTH flagged and every picker
      // (`find(t => t.isDefault)`) kept choosing whichever sorted first by name —
      // the template the user just made the default was ignored.
      if (updates.isDefault === true) {
        let docType: string | null = updates.docType ?? null;
        if (!docType) {
          const { data: row } = await supabase
            .from("crm_document_templates")
            .select("doc_type")
            .eq("id", id)
            .maybeSingle();
          docType = row?.doc_type ?? null;
        }
        if (docType) {
          const { error: clearError } = await supabase
            .from("crm_document_templates")
            .update({ is_default: false })
            .eq("doc_type", docType)
            .eq("is_default", true)
            .neq("id", id)
            .is("deleted_at", null);
          if (clearError) throw clearError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-document-templates"] });
      qc.invalidateQueries({ queryKey: ["crm-document-template", id] });
    },
  });
}

// ── Soft delete ───────────────────────────────────────────────────────────────

export function useDeleteDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_document_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-document-templates"] }),
  });
}

// ── Save blocks (full replace) ────────────────────────────────────────────────

export function useSaveDocumentBlocks(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      blocks: Array<{
        blockType: BlockType;
        orderIndex: number;
        content: string | null;
        settings: Record<string, unknown>;
      }>
    ) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user!.id)
        .single();

      // Replace the block set without a window where the template has none:
      // note the current rows, insert the new set, THEN remove the old rows.
      // (Deleting first lost every block when the insert failed, and an
      // unchecked delete failure left old + new blocks duplicated.)
      const { data: previous, error: previousError } = await supabase
        .from("crm_document_blocks")
        .select("id")
        .eq("template_id", templateId);
      if (previousError) throw previousError;
      const previousIds = (previous ?? []).map((b) => b.id);

      if (blocks.length > 0) {
        const { error } = await supabase.from("crm_document_blocks").insert(
          blocks.map((b) => ({
            template_id:  templateId,
            org_id:       profile!.org_id,
            block_type:   b.blockType,
            order_index:  b.orderIndex,
            content:      b.content,
            // The editor hands back a plain object; the column is jsonb, and
            // Json won't accept Record<string, unknown> without being told.
            settings:     b.settings as Json,
          }))
        );
        if (error) throw error;
      }

      if (previousIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("crm_document_blocks")
          .delete()
          .in("id", previousIds);
        if (deleteError) throw deleteError;
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["crm-document-template", templateId] }),
  });
}

// ── Send test email ──────────────────────────────────────────────────────────

export function useSendTestDocumentEmail(templateId: string) {
  return useMutation({
    mutationFn: async (input: {
      subject: string | null;
      blocks: Array<{
        blockType: BlockType;
        orderIndex: number;
        content: string | null;
        settings?: Record<string, unknown>;
      }>;
    }): Promise<{ sentTo: string }> => {
      const res = await fetch(`/api/crm/documents/${templateId}/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send test email");
      return data;
    },
  });
}
