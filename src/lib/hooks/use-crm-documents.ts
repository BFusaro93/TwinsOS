"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  DocumentTemplate,
  DocumentBlock,
  DocumentTemplateWithBlocks,
  DocType,
  DocStatus,
  BlockType,
} from "@/types/crm-documents";

const supabase = createClient();
const db = supabase as any;

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapTemplate(row: any): DocumentTemplate {
  return {
    id:          row.id,
    orgId:       row.org_id,
    name:        row.name,
    docType:     row.doc_type,
    description: row.description ?? null,
    subject:     row.subject ?? null,
    status:      row.status,
    isDefault:   row.is_default,
    includePdf:  row.include_pdf,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

function mapBlock(row: any): DocumentBlock {
  return {
    id:          row.id,
    templateId:  row.template_id,
    orgId:       row.org_id,
    blockType:   row.block_type,
    orderIndex:  row.order_index,
    content:     row.content ?? null,
    settings:    row.settings ?? {},
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useDocumentTemplates() {
  return useQuery({
    queryKey: ["crm-document-templates"],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_document_templates")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any[]).map(mapTemplate);
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
          db.from("crm_document_templates").select("*").eq("id", id).single(),
          db
            .from("crm_document_blocks")
            .select("*")
            .eq("template_id", id)
            .order("order_index", { ascending: true }),
        ]);
      if (tplErr) throw tplErr;
      if (blkErr) throw blkErr;
      return {
        ...mapTemplate(tpl),
        blocks: (blocks as any[]).map(mapBlock),
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
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user!.id)
        .single();

      const { data, error } = await db
        .from("crm_document_templates")
        .insert({
          org_id:      profile!.org_id,
          name:        input.name,
          doc_type:    input.docType,
          description: input.description ?? null,
          subject:     input.subject ?? null,
          created_by:  user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return mapTemplate(data);
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
    }>) => {
      const payload: any = {};
      if (updates.name        !== undefined) payload.name        = updates.name;
      if (updates.docType     !== undefined) payload.doc_type    = updates.docType;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.subject     !== undefined) payload.subject     = updates.subject;
      if (updates.status      !== undefined) payload.status      = updates.status;
      if (updates.isDefault   !== undefined) payload.is_default  = updates.isDefault;
      if (updates.includePdf  !== undefined) payload.include_pdf = updates.includePdf;

      const { error } = await db
        .from("crm_document_templates")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
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
      const { error } = await db
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

      // Delete existing blocks then re-insert
      await db
        .from("crm_document_blocks")
        .delete()
        .eq("template_id", templateId);

      if (blocks.length === 0) return;

      const { error } = await db.from("crm_document_blocks").insert(
        blocks.map((b) => ({
          template_id:  templateId,
          org_id:       profile!.org_id,
          block_type:   b.blockType,
          order_index:  b.orderIndex,
          content:      b.content,
          settings:     b.settings,
        }))
      );
      if (error) throw error;
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
