import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  AnalysisConfig,
  CustomReport,
  CustomReportInput,
  ReportFilterOption,
  ReportResult,
} from "@/types/crm-reports";

// ── shared ────────────────────────────────────────────────────────────────────

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

// ── pre-built report runs ─────────────────────────────────────────────────────

export function useRunReport(reportKey: string, params: Record<string, string>) {
  return useQuery<ReportResult>({
    queryKey: ["report-run", reportKey, params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== "") qs.set(key, value);
      }
      const res = await fetch(`/api/crm/reports/run/${reportKey}?${qs.toString()}`);
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<ReportResult>;
    },
  });
}

// ── custom analysis runs ──────────────────────────────────────────────────────

export function useRunAnalysis() {
  return useMutation<ReportResult, Error, AnalysisConfig>({
    mutationFn: async (config) => {
      const res = await fetch("/api/crm/reports/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<ReportResult>;
    },
  });
}

// ── custom (saved) reports CRUD ───────────────────────────────────────────────

export function useCustomReports() {
  return useQuery<CustomReport[]>({
    queryKey: ["custom-reports"],
    queryFn: async () => {
      const res = await fetch("/api/crm/custom-reports");
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { reports: CustomReport[] };
      return body.reports;
    },
  });
}

export function useCustomReport(id: string | undefined) {
  return useQuery<CustomReport>({
    queryKey: ["custom-reports", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/crm/custom-reports/${id}`);
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { report: CustomReport };
      return body.report;
    },
  });
}

export function useCreateCustomReport() {
  const queryClient = useQueryClient();
  return useMutation<CustomReport, Error, CustomReportInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/crm/custom-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { report: CustomReport };
      return body.report;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-reports"] });
    },
  });
}

export function useUpdateCustomReport() {
  const queryClient = useQueryClient();
  return useMutation<CustomReport, Error, CustomReportInput & { id: string }>({
    mutationFn: async ({ id, ...input }) => {
      const res = await fetch(`/api/crm/custom-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { report: CustomReport };
      return body.report;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-reports"] });
    },
  });
}

export function useDeleteCustomReport() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/crm/custom-reports/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-reports"] });
    },
  });
}

// ── dynamic filter options ────────────────────────────────────────────────────

export type ReportFilterOptionsSource =
  | "services"
  | "salesReps"
  | "crews"
  | "paymentMethods";

const PAYMENT_METHODS = [
  "Cash",
  "Check",
  "ACH/E-Check",
  "AutoPay",
  "Credit Card- AmEx/Discover/MasterCard/Visa",
  "AR Write-off",
  "Other",
];

export function useReportFilterOptions(source?: ReportFilterOptionsSource) {
  return useQuery<ReportFilterOption[]>({
    queryKey: ["report-filter-options", source],
    enabled: !!source,
    queryFn: async () => {
      if (source === "paymentMethods") {
        return PAYMENT_METHODS.map((m) => ({ value: m, label: m }));
      }
      const supabase = createClient();
      if (source === "services") {
        // crm_services is newer than the generated Database types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("crm_services")
          .select("name")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name");
        if (error) throw new Error(error.message);
        return ((data ?? []) as { name: string | null }[])
          .filter((r): r is { name: string } => !!r.name)
          .map((r) => ({ value: r.name, label: r.name }));
      }
      if (source === "salesReps") {
        // profiles columns drift from the generated Database types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("profiles")
          .select("name")
          .order("name");
        if (error) throw new Error(error.message);
        const names = ((data ?? []) as { name: string | null }[])
          .map((r) => r.name)
          .filter((n): n is string => !!n);
        return [...new Set(names)].map((n) => ({ value: n, label: n }));
      }
      if (source === "crews") {
        // crm_crews is newer than the generated Database types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("crm_crews")
          .select("name")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name");
        if (error) throw new Error(error.message);
        return ((data ?? []) as { name: string | null }[])
          .filter((r): r is { name: string } => !!r.name)
          .map((r) => ({ value: r.name, label: r.name }));
      }
      return [];
    },
  });
}
