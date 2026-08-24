"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPortalDocument, type PortalDocument } from "@/types/portal-document";

const BUCKET = "portal-documents";
const QUERY_KEY = ["portal_documents"];

export function usePortalDocuments() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("portal_documents")
        .select("*")
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return ((data ?? []).map(mapPortalDocument)) as PortalDocument[];
    },
  });
}

export function useUploadPortalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      title: string;
      description: string | null;
      category: string;
    }) => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", authData.user!.id)
        .single();

      const storagePath = `${prof!.org_id}/${Date.now()}-${input.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, { upsert: false });
      if (uploadError) throw uploadError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbError } = await (supabase as any).from("portal_documents").insert({
        org_id: prof!.org_id,
        title: input.title,
        description: input.description,
        category: input.category || "General",
        storage_path: storagePath,
        file_name: input.file.name,
        size_bytes: input.file.size,
        mime_type: input.file.type || null,
        created_by: authData.user!.id,
      });
      if (dbError) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw dbError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeletePortalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; storagePath: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("portal_documents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([input.storagePath]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
