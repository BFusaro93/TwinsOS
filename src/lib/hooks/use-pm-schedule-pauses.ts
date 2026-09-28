import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { PMSchedulePause, PMSchedulePauseState } from "@/types/cmms";

function invalidatePauseQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["pm-schedule-pauses"] });
  queryClient.invalidateQueries({ queryKey: ["pm-schedule-pause-state"] });
  // Pausing changes which cycles count as missed.
  queryClient.invalidateQueries({ queryKey: ["pm-outcomes"] });
  queryClient.invalidateQueries({ queryKey: ["asset-metrics"] });
  queryClient.invalidateQueries({ queryKey: ["pm-schedules"] });
}

export function usePMSchedulePauses(pmScheduleId: string) {
  return useQuery({
    queryKey: ["pm-schedule-pauses", pmScheduleId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedule_pauses")
        .select("id, pm_schedule_id, starts_on, resumes_on, recurs_yearly, ended_on, reason, created_at")
        .eq("pm_schedule_id", pmScheduleId)
        .is("deleted_at", null)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return data.map((r): PMSchedulePause => ({
        id: r.id,
        pmScheduleId: r.pm_schedule_id,
        startsOn: r.starts_on,
        resumesOn: r.resumes_on,
        recursYearly: r.recurs_yearly,
        endedOn: r.ended_on,
        reason: r.reason,
        createdAt: r.created_at,
      }));
    },
    enabled: !!pmScheduleId,
  });
}

/** Schedules paused today, keyed by schedule id. */
export function usePausedPMSchedules() {
  return useQuery({
    queryKey: ["pm-schedule-pause-state"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("v_pm_schedule_pause_state")
        .select("pm_schedule_id, current_pause_id, recurs_yearly, paused_until")
        .eq("paused_today", true);
      if (error) throw error;
      const map = new Map<string, PMSchedulePauseState>();
      for (const r of data ?? []) {
        if (!r.pm_schedule_id) continue;
        map.set(r.pm_schedule_id, {
          pmScheduleId: r.pm_schedule_id,
          currentPauseId: r.current_pause_id,
          recursYearly: r.recurs_yearly,
          pausedUntil: r.paused_until,
        });
      }
      return map;
    },
  });
}

export function useCreatePMSchedulePause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PMSchedulePause, "id" | "createdAt" | "endedOn">) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("pm_schedule_pauses").insert({
        pm_schedule_id: input.pmScheduleId,
        starts_on: input.startsOn,
        resumes_on: input.resumesOn,
        recurs_yearly: input.recursYearly,
        reason: input.reason,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidatePauseQueries(queryClient),
  });
}

/**
 * End a pause today (end_pm_schedule_pause). A pause that has already
 * started is never deleted — a one-off one resumes today and a seasonal one
 * stops recurring from today — so the cycles it excused stay excused in PM
 * compliance. Only a pause that hasn't started yet (starts today or later)
 * is removed outright. A next due date left in the past by the pause moves to
 * the next cycle on or after today.
 */
export function useEndPMSchedulePause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pauseId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("end_pm_schedule_pause", { p_pause_id: pauseId });
      if (error) throw error;
      const result = (data ?? {}) as { deleted?: boolean; next_due_date?: string | null };
      return { deleted: !!result.deleted, nextDueDate: result.next_due_date ?? null };
    },
    onSuccess: () => invalidatePauseQueries(queryClient),
  });
}
