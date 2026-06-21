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

const CMMS_RECORD_TYPES = [
  "work_order",
  "po",
  "receiving",
  "requisition",
  "part",
  "asset",
  "vehicle",
  "project",
  "pm_schedule",
] as const;

/** Returns the most recent CMMS/PO audit entries — excludes CRM activity. */
export function useRecentActivityFeed(limit = 8) {
  return useQuery({
    queryKey: ["audit-log-feed", limit],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .in("record_type", CMMS_RECORD_TYPES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.map(mapAuditEntry);
    },
  });
}
