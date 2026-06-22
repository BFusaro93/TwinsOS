import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAttachment } from "@/lib/supabase/mappers";
import type { Attachment, AttachmentRecordType } from "@/types/attachment";

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
      return (data.map(mapAttachment)) as Attachment[];
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
          const storagePath = `${recordType}/${recordId}/${Date.now()}-${file.name}`;

          // Fast path: stream File directly — no JS heap copy, fast for local files.
          // The Supabase storage client may either return { error } OR throw depending
          // on the SDK version and browser, so we catch both.
          let uploadError: { message: string } | null = null;
          try {
            ({ error: uploadError } = await supabase.storage
              .from("attachments")
              .upload(storagePath, file, { upsert: false, contentType: file.type }));
          } catch (e) {
            uploadError = e instanceof Error ? e : { message: String(e) };
          }

          // Safari + iCloud Drive / sandboxed file picker fallback: Safari throws
          // "Load failed" (or "Failed to fetch") when the file hasn't been downloaded
          // from iCloud yet. Materialise it into an ArrayBuffer first, then retry.
          const needsFallback =
            uploadError != null &&
            /load failed|failed to fetch/i.test(uploadError.message);

          if (needsFallback) {
            const buffer = await file.arrayBuffer();
            const blob = new Blob([buffer], { type: file.type });
            try {
              ({ error: uploadError } = await supabase.storage
                .from("attachments")
                .upload(storagePath, blob, { upsert: true, contentType: file.type }));
            } catch (e) {
              uploadError = e instanceof Error ? e : { message: String(e) };
            }
          }

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
          if (insertError) {
            // Storage upload succeeded but DB insert failed — clean up the orphaned
            // storage object so it doesn't accumulate as a ghost file.
            await supabase.storage.from("attachments").remove([storagePath]);
            throw insertError;
          }

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

export function useDeleteAttachment(recordType: AttachmentRecordType, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath: string }) => {
      const supabase = createClient();
      // Soft-delete the DB record
      const { error: dbError } = await supabase
        .from("attachments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (dbError) throw dbError;
      // Best-effort storage removal — don't block on failure
      await supabase.storage.from("attachments").remove([storagePath]);
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
