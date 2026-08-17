import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AvbWeekRecord {
  id: string;
  weekEnd: string; // "YYYY-MM-DD"
  data: AvbWeekData;
  createdAt: string;
  updatedAt: string;
}

export interface AvbWeekData {
  days: Record<number, DayData>; // 0-6 = Mon-Sun
  gusto: GustoData;
}

export interface DayData {
  assignments: Record<string, string[]>; // crewCode → uuid[]
  avb: Record<string, { budgeted: number; actual: number; revenue: number }>;
}

export interface GustoData {
  weekStart: string | null;
  weekEnd: string | null;
  employees: Record<string, EmpData>;
}

export interface EmpData {
  total: number;
  regular: number;
  ot: number;
  days: DayEntry[];
}

export interface DayEntry {
  date: string;
  total: number;
  regular: number;
  ot: number;
  mealBreak: number;
  timeRange: string;
  job: string;
}

function mapRow(row: { id: string; week_end: string; data: unknown; created_at: string; updated_at: string }): AvbWeekRecord {
  return {
    id: row.id,
    weekEnd: row.week_end,
    data: row.data as AvbWeekData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useAvbWeeks() {
  return useQuery<AvbWeekRecord[]>({
    queryKey: ["avb-weeks"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("avb_weeks")
        .select("id, week_end, data, created_at, updated_at")
        .order("week_end", { ascending: true });
      if (error) throw error;
      return ((data ?? []).map(mapRow)) as AvbWeekRecord[];
    },
  });
}

export function useUpsertAvbWeek() {
  const qc = useQueryClient();
  return useMutation({
    /**
     * `expectedUpdatedAt` — pass the `updatedAt` of the record that was loaded
     * into the editor (AvbDashboard.handleEditWeek) when editing an EXISTING
     * week. The whole week is one JSONB blob loaded once, edited client-side,
     * and written back wholesale — without this check, two people editing the
     * same week concurrently (one fixing crew assignments, another
     * re-importing a Gusto CSV) would have whoever saves last silently
     * overwrite the other's edits with no warning. Omit it for a brand-new
     * week (nothing to conflict with yet).
     */
    mutationFn: async ({ weekEnd, data, expectedUpdatedAt }: { weekEnd: string; data: AvbWeekData; expectedUpdatedAt?: string }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org found for user");

      if (expectedUpdatedAt) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updatedRows, error } = await (supabase as any)
          .from("avb_weeks")
          .update({ data: data as unknown as never })
          .eq("org_id", orgId)
          .eq("week_end", weekEnd)
          .eq("updated_at", expectedUpdatedAt)
          .select("id");
        if (error) throw error;
        if (!updatedRows || updatedRows.length === 0) {
          throw new Error(
            "This week was modified by someone else since you opened it. Reload the week and re-apply your changes before saving."
          );
        }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("avb_weeks")
        .upsert({ org_id: orgId, week_end: weekEnd, data: data as unknown as never }, { onConflict: "org_id,week_end" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avb-weeks"] }),
  });
}

export function useDeleteAvbWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekEnd: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("avb_weeks")
        .delete()
        .eq("week_end", weekEnd);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avb-weeks"] }),
  });
}
