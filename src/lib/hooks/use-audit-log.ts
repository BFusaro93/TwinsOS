import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAuditEntry } from "@/lib/supabase/mappers";
import type { AuditEntry, AuditRecordType } from "@/types/audit";

export function useAuditLog(recordType: AuditRecordType, recordId: string) {
  return useQuery({
    queryKey: ["audit-log", recordType, recordId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_log")
        .select("*")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data.map(mapAuditEntry)) as AuditEntry[];
    },
    enabled: !!recordId,
    // Audit history is written by DB triggers, not by any mutation this app
    // calls directly, so nothing invalidates this query on change. The
    // global 60s staleTime would otherwise show a stale list for up to a
    // minute after editing a record and reopening its Audit Trail tab.
    staleTime: 0,
  });
}

/**
 * Combines several (recordType, recordIds[]) groups into one chronological
 * feed — e.g. a job's own entries plus every one of its visits' entries,
 * which audit_log can't express as a single query since job and job_visit
 * rows use different record_id spaces.
 */
export function useMultiRecordAuditLog(groups: { recordType: AuditRecordType; recordIds: string[] }[]) {
  const nonEmptyGroups = groups.filter((g) => g.recordIds.length > 0);
  const queryKey = ["audit-log-multi", ...nonEmptyGroups.map((g) => `${g.recordType}:${g.recordIds.slice().sort().join(",")}`)];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const supabase = createClient();
      const results = await Promise.all(
        nonEmptyGroups.map(async (g) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any)
            .from("audit_log")
            .select("*")
            .eq("record_type", g.recordType)
            .in("record_id", g.recordIds);
          if (error) throw error;
          return data;
        })
      );
      const merged = (results.flat().map(mapAuditEntry)) as AuditEntry[];
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return merged;
    },
    enabled: nonEmptyGroups.length > 0,
    staleTime: 0,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_log")
        .select("*")
        .in("record_type", CMMS_RECORD_TYPES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data.map(mapAuditEntry)) as AuditEntry[];
    },
  });
}
