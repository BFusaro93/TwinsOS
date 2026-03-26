import { useQuery } from "@tanstack/react-query";
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
