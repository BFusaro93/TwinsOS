"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { getStorageOrgPrefix } from "@/lib/supabase/storage-org-prefix";
import { logClientActivity } from "@/lib/hooks/use-clients";

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
      // Storage keys reject many characters that are legal in file names
      // (brackets, #, non-ASCII…) — keep the original name in the DB row and
      // use a safe one in the key.
      const safeName = input.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      // Impersonating staff upload into the impersonated org, not their own.
      const orgPrefix = await getStorageOrgPrefix(supabase);
      const storagePath = `${orgPrefix}/${input.clientId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, { upsert: false });
      if (uploadError) throw uploadError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbError } = await (supabase as any).from("client_files").insert({
        org_id: orgPrefix,
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
      await logClientActivity(supabase, input.clientId, `File uploaded: ${input.file.name}`);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["client_files", v.clientId] });
      qc.invalidateQueries({ queryKey: ["clients", v.clientId, "activity"] });
    },
  });
}

export function useDeleteClientFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; clientId: string; storagePath: string }) => {
      const supabase = createClient();
      // Soft-delete the DB record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: removed, error } = await (supabase as any)
        .from("client_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .select("name")
        .maybeSingle();
      if (error) throw error;
      // Remove from storage
      await supabase.storage.from(BUCKET).remove([input.storagePath]);
      await logClientActivity(supabase, input.clientId, `File deleted${removed?.name ? `: ${removed.name}` : ""}`);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["client_files", v.clientId] });
      qc.invalidateQueries({ queryKey: ["clients", v.clientId, "activity"] });
    },
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
