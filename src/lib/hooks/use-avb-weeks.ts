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
      const { data, error } = await supabase
        .from("avb_weeks")
        .select("id, week_end, data, created_at, updated_at")
        .order("week_end", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useUpsertAvbWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekEnd, data }: { weekEnd: string; data: AvbWeekData }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const orgId = user?.user_metadata?.org_id as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
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
      const { error } = await supabase
        .from("avb_weeks")
        .delete()
        .eq("week_end", weekEnd);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avb-weeks"] }),
  });
}
