import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getDataset } from "@/lib/reports/datasets";
import { GRAPHIC_TEMPLATES } from "@/lib/reports/graphic-templates";
import type {
  AnalysisConfig,
  CustomReport,
  CustomReportInput,
  Dashboard,
  DashboardInput,
  ReportFilterOption,
  ReportResult,
  SavedGraphic,
  SavedGraphicInput,
  VisualSpec,
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
        // The rpt_* views' "sales_rep" text column is the rep's
        // first+last name from crm_employees (see
        // 20260903030000_report_views_sales_rep_target_employees.sql), so
        // these filter options must be drawn from the same table/columns
        // to actually match.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("crm_employees")
          .select("first_name, last_name")
          .eq("is_sales_rep", true)
          .is("deleted_at", null)
          .order("first_name");
        if (error) throw new Error(error.message);
        const names = ((data ?? []) as { first_name: string | null; last_name: string | null }[])
          .map((r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim())
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

// ── dashboards CRUD ───────────────────────────────────────────────────────────

export function useDashboards() {
  return useQuery<Dashboard[]>({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const res = await fetch("/api/crm/dashboards");
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { dashboards: Dashboard[] };
      return body.dashboards;
    },
  });
}

export function useDashboard(id: string | undefined) {
  return useQuery<Dashboard>({
    queryKey: ["dashboards", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/crm/dashboards/${id}`);
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { dashboard: Dashboard };
      return body.dashboard;
    },
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation<Dashboard, Error, DashboardInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/crm/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { dashboard: Dashboard };
      return body.dashboard;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

export function useUpdateDashboard() {
  const queryClient = useQueryClient();
  return useMutation<Dashboard, Error, DashboardInput & { id: string }>({
    mutationFn: async ({ id, ...input }) => {
      const res = await fetch(`/api/crm/dashboards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { dashboard: Dashboard };
      return body.dashboard;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/crm/dashboards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

// ── saved graphics (Graphics Library) CRUD ────────────────────────────────────

export function useSavedGraphics() {
  return useQuery<SavedGraphic[]>({
    queryKey: ["saved-graphics"],
    queryFn: async () => {
      const res = await fetch("/api/crm/graphics");
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { graphics: SavedGraphic[] };
      return body.graphics;
    },
  });
}

export function useCreateSavedGraphic() {
  const queryClient = useQueryClient();
  return useMutation<SavedGraphic, Error, SavedGraphicInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/crm/graphics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { graphic: SavedGraphic };
      return body.graphic;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saved-graphics"] });
    },
  });
}

export function useDeleteSavedGraphic() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/crm/graphics/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saved-graphics"] });
    },
  });
}

// ── combined Graphics Library items (system catalog + org's saved graphics) ──

export interface GraphicLibraryItem {
  /** Stable across renders — template key for system graphics, row id for
   *  saved ones. Prefixed so the two id spaces never collide. */
  id: string;
  name: string;
  description: string | null;
  category: string;
  visual: VisualSpec;
  isSystem: boolean;
}

export function useGraphicLibraryItems() {
  const saved = useSavedGraphics();
  const items: GraphicLibraryItem[] = [
    ...GRAPHIC_TEMPLATES.map((t) => ({
      id: `system:${t.key}`,
      name: t.name,
      description: t.description,
      category: t.category,
      visual: t.visual,
      isSystem: true,
    })),
    ...(saved.data ?? []).map((g) => ({
      id: `saved:${g.id}`,
      name: g.name,
      description: g.description,
      category: g.category ?? "My Graphics",
      visual: g.visual,
      isSystem: false,
    })),
  ];
  return { items, isLoading: saved.isLoading };
}

// ── run a dashboard panel's visual ────────────────────────────────────────────

/**
 * Builds the effective AnalysisConfig for a visual (merging in the shared
 * tab date-range filter when useTabDateRange is set) and runs it through the
 * same /api/crm/reports/analysis/run endpoint the custom-analysis builder uses.
 */
function relativeDateISO(kind: "today" | "yesterday"): string {
  const d = new Date();
  if (kind === "yesterday") d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildEffectiveConfig(
  visual: VisualSpec,
  dateRange?: { from: string; to: string },
  repFilter?: string
): AnalysisConfig {
  let config = visual.config;
  const dataset = getDataset(config.dataset);
  const dateField = visual.dateColumn ?? dataset?.defaultDateField;
  if (visual.useTabDateRange && dateRange && dateField) {
    config = {
      ...config,
      filters: [
        ...config.filters,
        { column: dateField, op: "gte", value: dateRange.from },
        { column: dateField, op: "lte", value: dateRange.to },
      ],
    };
  }
  if (visual.relativeDateFilter && dateField) {
    config = {
      ...config,
      filters: [
        ...config.filters,
        { column: dateField, op: "eq", value: relativeDateISO(visual.relativeDateFilter) },
      ],
    };
  }
  if (visual.useTabRepFilter && repFilter) {
    config = {
      ...config,
      filters: [...config.filters, { column: "sales_rep", op: "eq", value: repFilter }],
    };
  }
  return config;
}

export function useRunVisualQuery(
  visual: VisualSpec | undefined,
  dateRange?: { from: string; to: string },
  repFilter?: string
) {
  return useQuery<ReportResult>({
    queryKey: ["run-visual", visual, dateRange, repFilter],
    enabled: !!visual,
    queryFn: async () => {
      const config = buildEffectiveConfig(visual as VisualSpec, dateRange, repFilter);
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
