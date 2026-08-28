import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ReportSchedule {
  id: string;
  report_key: string;
  recipients: string[];
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  created_at: string;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useReportSchedules() {
  return useQuery<ReportSchedule[]>({
    queryKey: ["report-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/crm/report-schedules");
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { schedules: ReportSchedule[] };
      return body.schedules;
    },
  });
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportKey: string; recipients: string[] }) => {
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
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });
}

export function useUpdateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      recipients?: string[];
      enabled?: boolean;
    }) => {
      const res = await fetch(`/api/crm/report-schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { schedule: ReportSchedule };
      return body.schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
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
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });
}
