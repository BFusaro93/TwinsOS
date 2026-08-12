"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SequenceExecutionLogEntry {
  id: string;
  action: string;
  eventType: string | null;
  detail: string | null;
  sequenceName: string | null;
  clientName: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createClient() as unknown as any; }

export function useSequenceExecutionLog(limit = 200) {
  return useQuery({
    queryKey: ["crm-sequence-execution-log", limit],
    queryFn: async (): Promise<SequenceExecutionLogEntry[]> => {
      const { data, error } = await db()
        .from("crm_sequence_execution_log")
        .select("id, action, event_type, detail, created_at, crm_automation_sequences(name), clients(display_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        id: row.id,
        action: row.action,
        eventType: row.event_type,
        detail: row.detail,
        sequenceName: row.crm_automation_sequences?.name ?? null,
        clientName: row.clients?.display_name ?? null,
        createdAt: row.created_at,
      }));
    },
    refetchInterval: 30_000,
  });
}
