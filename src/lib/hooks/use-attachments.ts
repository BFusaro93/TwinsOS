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

export function useUploadAttachment(recordType: AttachmentRecordType, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const supabase = createClient();

      // Get current user name for uploaded_by_name
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user?.id ?? "")
        .single();

      // Upload file to Supabase Storage
      const storagePath = `${recordType}/${recordId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, file, { upsert: false });
      if (uploadError) throw uploadError;

      // Insert attachment record
      const { error: insertError } = await supabase.from("attachments").insert({
        record_type: recordType,
        record_id: recordId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: storagePath,
        uploaded_by_name: profile?.name ?? user?.email ?? "Unknown",
      });
      if (insertError) throw insertError;
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
