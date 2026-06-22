"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ClientFile {
  id: string;
  clientId: string;
  name: string;
  storagePath: string;
  sizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFile(row: any): ClientFile {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes ?? null,
    mimeType: row.mime_type ?? null,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
  };
}

const BUCKET = "client-files";

export function useClientFiles(clientId: string) {
  return useQuery({
    queryKey: ["client_files", clientId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_files")
        .select("*")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []).map(mapFile)) as ClientFile[];
    },
    enabled: !!clientId,
  });
}

export function useUploadClientFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; file: File }) => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", authData.user!.id)
        .single();

      const ext = input.file.name.split(".").pop();
      const storagePath = `${prof!.org_id}/${input.clientId}/${Date.now()}-${input.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, { upsert: false });
      if (uploadError) throw uploadError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbError } = await (supabase as any).from("client_files").insert({
        org_id: prof!.org_id,
        client_id: input.clientId,
        name: input.file.name,
        storage_path: storagePath,
        size_bytes: input.file.size,
        mime_type: input.file.type || (ext ? `application/${ext}` : null),
        uploaded_by: authData.user!.id,
      });
      if (dbError) {
        // Clean up the uploaded file if DB insert fails
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw dbError;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["client_files", v.clientId] }),
  });
}

export function useDeleteClientFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; clientId: string; storagePath: string }) => {
      const supabase = createClient();
      // Soft-delete the DB record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("client_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
      // Remove from storage
      await supabase.storage.from(BUCKET).remove([input.storagePath]);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["client_files", v.clientId] }),
  });
}

export function useSignedFileUrl() {
  return async (storagePath: string): Promise<string> => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 300); // 5 min expiry
    if (error) throw error;
    return data.signedUrl;
  };
}
