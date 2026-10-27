import { useQuery } from "@/lib/hooks/use-query";
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
        .is("deleted_at", null)
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
      // A recurring job can have hundreds of visits. `.in("record_id", ids)` puts
      // every id in the URL (hundreds of ids overflow the gateway's URL limit and
      // the whole tab errors), and PostgREST caps a response at 1000 rows with no
      // error — so chunk the ids and page each chunk instead of one big query.
      const ID_CHUNK = 100;
      const PAGE = 1000;
      const results = await Promise.all(
        nonEmptyGroups.flatMap((g) => {
          const chunks: string[][] = [];
          for (let i = 0; i < g.recordIds.length; i += ID_CHUNK) chunks.push(g.recordIds.slice(i, i + ID_CHUNK));
          return chunks.map(async (ids) => {
            const rows: Parameters<typeof mapAuditEntry>[0][] = [];
            for (let from = 0; ; from += PAGE) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data, error } = await (supabase as any)
                .from("audit_log")
                .select("*")
                .eq("record_type", g.recordType)
                .in("record_id", ids)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .order("id")
                .range(from, from + PAGE - 1);
              if (error) throw error;
              rows.push(...(data ?? []));
              if (!data || data.length < PAGE) break;
            }
            return rows;
          });
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
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data.map(mapAuditEntry)) as AuditEntry[];
    },
  });
}
