import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import type {
  CreateReportScheduleInput,
  ReportScheduleRow,
  UpdateReportScheduleInput,
} from "@/types/report-schedules";

export type ReportSchedule = ReportScheduleRow;

const QUERY_KEY = ["report-schedules"] as const;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useReportSchedules(options: { enabled?: boolean } = {}) {
  return useQuery<ReportSchedule[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/crm/report-schedules");
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { schedules: ReportSchedule[] };
      return body.schedules;
    },
    enabled: options.enabled ?? true,
  });
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReportScheduleInput) => {
      const res = await fetch("/api/crm/report-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { schedule: ReportSchedule };
      return body.schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** PATCH a schedule. A pause/resume (`enabled` only) flips the row in the
 *  cache optimistically and rolls back on error. */
export function useUpdateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateReportScheduleInput & { id: string }) => {
      const res = await fetch(`/api/crm/report-schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { schedule: ReportSchedule };
      return body.schedule;
    },
    onMutate: async ({ id, enabled }) => {
      if (enabled === undefined) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ReportSchedule[]>(QUERY_KEY);
      queryClient.setQueryData<ReportSchedule[]>(QUERY_KEY, (rows) =>
        rows?.map((row) => (row.id === id ? { ...row, enabled } : row))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/report-schedules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
