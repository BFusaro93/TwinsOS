"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { getStorageOrgPrefix } from "@/lib/supabase/storage-org-prefix";
import { openPendingTab, showInPendingTab } from "@/lib/utils/pending-tab";
import type { ReferenceCategory, ReferenceDocument } from "@/types/crm-reference";

const BUCKET = "reference-library";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(row: any): ReferenceDocument {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description ?? null,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    revisionDate: row.revision_date ?? null,
    productIds: row.product_ids ?? [],
    visibleToCrew: row.visible_to_crew ?? true,
    createdAt: row.created_at,
  };
}

export function useReferenceDocuments() {
  return useQuery({
    queryKey: ["reference-documents"],
    queryFn: async (): Promise<ReferenceDocument[]> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_reference_documents")
        .select("*")
        .is("deleted_at", null)
        .order("title");
      if (error) throw error;
      return (data ?? []).map(mapDoc);
    },
  });
}

/** The documents linked to one product (label, SDS, instructions). */
export function useProductReferenceDocuments(productId: string | undefined) {
  const { data = [], isLoading } = useReferenceDocuments();
  return { data: productId ? data.filter((d) => d.productIds.includes(productId)) : [], isLoading };
}

export interface ReferenceDocumentInput {
  category: ReferenceCategory;
  title: string;
  description: string | null;
  revisionDate: string | null;
  productIds: string[];
  visibleToCrew: boolean;
}

export function useUploadReferenceDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File } & ReferenceDocumentInput) => {
      const supabase = createClient();
      // Storage keys reject many characters that are legal in file names; the DB keeps the real name.
      const safeName = input.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const orgPrefix = await getStorageOrgPrefix(supabase);
      const storagePath = `${orgPrefix}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, input.file, { upsert: false });
      if (uploadError) throw uploadError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_reference_documents").insert({
        org_id: orgPrefix,
        category: input.category,
        title: input.title,
        description: input.description,
        file_name: input.file.name,
        storage_path: storagePath,
        mime_type: input.file.type || null,
        size_bytes: input.file.size,
        revision_date: input.revisionDate,
        product_ids: input.productIds,
        visible_to_crew: input.visibleToCrew,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reference-documents"] }),
  });
}

export function useUpdateReferenceDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & ReferenceDocumentInput) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_reference_documents")
        .update({
          category: input.category,
          title: input.title,
          description: input.description,
          revision_date: input.revisionDate,
          product_ids: input.productIds,
          visible_to_crew: input.visibleToCrew,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reference-documents"] }),
  });
}

export function useDeleteReferenceDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: { id: string; storagePath: string }) => {
      const supabase = createClient();
      // Soft delete (rows are never hard-deleted); the file itself is removed from storage.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_reference_documents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([doc.storagePath]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reference-documents"] }),
  });
}

/** Opens a document in a new tab through a short-lived signed link. The tab opens before the
 *  link is signed so iPad Safari doesn't block it (see utils/pending-tab). */
export async function openReferenceDocument(storagePath: string): Promise<void> {
  const tab = openPendingTab();
  try {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300);
    if (error) throw error;
    showInPendingTab(tab, data.signedUrl);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
