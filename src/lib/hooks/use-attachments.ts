import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAttachment } from "@/lib/supabase/mappers";
import type { AttachmentRecordType } from "@/types/attachment";

export function useAttachments(recordType: AttachmentRecordType, recordId: string) {
  return useQuery({
    queryKey: ["attachments", recordType, recordId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("attachments")
        .select("*")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapAttachment);
    },
    enabled: !!recordId,
  });
}

/** Result for a single file in a batch upload. */
export interface UploadResult {
  fileName: string;
  ok: boolean;
  error?: string;
}

export function useUploadAttachment(recordType: AttachmentRecordType, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * Accepts one or more files. All are uploaded in parallel.
     * Returns an array of per-file results so callers can surface partial failures.
     * Always invalidates the cache even when some files fail.
     */
    mutationFn: async (files: File | File[]): Promise<UploadResult[]> => {
      const fileList = Array.isArray(files) ? files : [files];
      const supabase = createClient();

      // Fetch caller identity once for all files
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user?.id ?? "")
        .single();
      const uploaderName = profile?.name ?? user?.email ?? "Unknown";

      const uploadOne = async (file: File): Promise<UploadResult> => {
        try {
          // Read into ArrayBuffer first to avoid Safari "Load failed" errors with
          // iCloud Drive or sandboxed file picker handles.
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer], { type: file.type });
          const storagePath = `${recordType}/${recordId}/${Date.now()}-${file.name}`;

          const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(storagePath, blob, { upsert: false, contentType: file.type });
          if (uploadError) throw uploadError;

          const { error: insertError } = await supabase.from("attachments").insert({
            record_type: recordType,
            record_id: recordId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            storage_path: storagePath,
            uploaded_by_name: uploaderName,
          });
          if (insertError) throw insertError;

          return { fileName: file.name, ok: true };
        } catch (err) {
          return {
            fileName: file.name,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      };

      return Promise.all(fileList.map(uploadOne));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments", recordType, recordId] });
    },
  });
}

export function useDownloadAttachment() {
  return useMutation({
    mutationFn: async ({ storagePath, fileName }: { storagePath: string; fileName: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("attachments")
        .createSignedUrl(storagePath, 60); // 60 seconds
      if (error) throw error;
      // Open in new tab
      window.open(data.signedUrl, "_blank");
    },
  });
}
