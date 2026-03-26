import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAuditEntry } from "@/lib/supabase/mappers";
import type { AuditRecordType } from "@/types/audit";

export function useAuditLog(recordType: AuditRecordType, recordId: string) {
  return useQuery({
    queryKey: ["audit-log", recordType, recordId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapAuditEntry);
    },
    enabled: !!recordId,
  });
}

/** Returns the most recent audit entries across all record types — used by the dashboard activity feed. */
export function useRecentActivityFeed(limit = 8) {
  return useQuery({
    queryKey: ["audit-log-feed", limit],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.map(mapAuditEntry);
    },
  });
}
