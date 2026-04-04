import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface DriverData {
  name: string;
  score: number;
  drive: string;   // "hh:mm:ss"
  miles: number;
  events: number;
}

export interface SafetyWeekData {
  label: string;       // e.g. "Mar 22–29"
  drivers: DriverData[];
}

export interface SafetyWeekRecord {
  id: string;
  weekEnd: string;     // "YYYY-MM-DD"
  data: SafetyWeekData;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: {
  id: string;
  week_end: string;
  data: unknown;
  created_at: string;
  updated_at: string;
}): SafetyWeekRecord {
  return {
    id: row.id,
    weekEnd: row.week_end,
    data: row.data as SafetyWeekData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useSafetyWeeks() {
  return useQuery<SafetyWeekRecord[]>({
    queryKey: ["safety-weeks"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("safety_weeks")
        .select("id, week_end, data, created_at, updated_at")
        .order("week_end", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useUpsertSafetyWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekEnd, data }: { weekEnd: string; data: SafetyWeekData }) => {
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
      const { error } = await supabase
        .from("safety_weeks")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ org_id: orgId, week_end: weekEnd, data: data as unknown as never }, { onConflict: "org_id,week_end" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safety-weeks"] }),
  });
}

export function useDeleteSafetyWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekEnd: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("safety_weeks")
        .delete()
        .eq("week_end", weekEnd);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safety-weeks"] }),
  });
}
