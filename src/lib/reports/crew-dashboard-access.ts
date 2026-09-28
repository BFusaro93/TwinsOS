import type { SupabaseClient } from "@supabase/supabase-js";
import { analysisConfigSchema } from "@/types/crm-reports";
import type {
  AnalysisConfig,
  AnalysisFilter,
  DashboardConfig,
  VisualSpec,
} from "@/types/crm-reports";
import { getDataset } from "@/lib/reports/datasets";

/**
 * Crew-role logins (profiles.role = 'crew') are shared field accounts with no
 * crm_employees record, so has_settings_permission('view_report_center') is
 * always false for them. Rather than granting them the whole Report Center,
 * admins opt individual dashboards in via crm_dashboards.visible_to_crew.
 *
 * These helpers let the dashboards + report-run API routes make a narrow
 * exception for crew: they may open only crew-visible dashboards, run only
 * the prebuilt reports those dashboards embed, and query only the datasets
 * those dashboards' visual panels use. Everything is still org-scoped by RLS.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export async function isCrewCaller(supabase: AnyClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "crew";
}

interface CrewDashboardRow {
  id: string;
  config: DashboardConfig;
}

async function fetchCrewVisibleDashboards(supabase: AnyClient): Promise<CrewDashboardRow[]> {
  const { data } = await supabase
    .from("crm_dashboards")
    .select("id, config")
    .eq("visible_to_crew", true)
    .is("deleted_at", null);
  return (data ?? []) as CrewDashboardRow[];
}

/** Prebuilt report keys + analysis datasets a crew login may execute, derived
 *  from the panels of every crew-visible dashboard in their org. */
export async function getCrewRunnableScope(
  supabase: AnyClient
): Promise<{ reportKeys: Set<string>; datasets: Set<string>; visuals: VisualSpec[] }> {
  const dashboards = await fetchCrewVisibleDashboards(supabase);
  const reportKeys = new Set<string>();
  const datasets = new Set<string>();
  const visuals: VisualSpec[] = [];
  for (const d of dashboards) {
    for (const tab of d.config?.tabs ?? []) {
      for (const panel of tab.panels ?? []) {
        if (panel.reportKey) reportKeys.add(panel.reportKey);
        else if (panel.visual?.config?.dataset) {
          datasets.add(panel.visual.config.dataset);
          visuals.push(panel.visual);
        }
      }
    }
  }
  return { reportKeys, datasets, visuals };
}

// ---------- exact-panel matching for crew analysis runs ----------

/** JSON with object keys sorted, so two structurally equal values compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DATE_OPS = new Set(["eq", "gte", "lt", "lte"]);

/** A filter the dashboard viewer may append to a panel's saved config at run
 *  time (buildEffectiveConfig in use-report-center.ts): a calendar-day bound on
 *  the panel's date column, or an eq on sales_rep from the tab's rep picker. */
function isAllowedRuntimeFilter(
  f: AnalysisFilter,
  visual: VisualSpec,
  dateField: string | undefined
): boolean {
  if (
    dateField &&
    (visual.useTabDateRange || visual.relativeDateFilter) &&
    f.column === dateField &&
    DATE_OPS.has(f.op) &&
    typeof f.value === "string" &&
    YMD.test(f.value)
  ) {
    return true;
  }
  return (
    !!visual.useTabRepFilter &&
    f.column === "sales_rep" &&
    f.op === "eq" &&
    typeof f.value === "string"
  );
}

/** Everything in an AnalysisConfig except its filters, canonicalised. */
function shapeKey(config: AnalysisConfig): string {
  const { filters: _filters, ...rest } = config;
  void _filters;
  return canonical({ ...rest, formulas: rest.formulas ?? [] });
}

/**
 * True when `requested` is exactly one crew-visible panel's saved config —
 * same dataset, columns, grouping, aggregates, formulas, sort and limit, and
 * the panel's own filters in order — optionally followed by the runtime
 * date-range / sales-rep filters the dashboard viewer appends (at most 3:
 * two date bounds + one rep). Anything else (extra columns, a different
 * filter, another grouping) is an ad-hoc query a crew login may not run.
 */
export function crewMayRunAnalysis(requested: AnalysisConfig, visuals: VisualSpec[]): boolean {
  const reqShape = shapeKey(requested);
  for (const visual of visuals) {
    const parsed = analysisConfigSchema.safeParse(visual.config);
    if (!parsed.success) continue;
    const base = parsed.data;
    if (base.dataset !== requested.dataset) continue;
    if (shapeKey(base) !== reqShape) continue;

    const baseFilters = base.filters;
    if (requested.filters.length < baseFilters.length) continue;
    const prefixMatches = baseFilters.every(
      (f, i) => canonical(f) === canonical(requested.filters[i])
    );
    if (!prefixMatches) continue;

    const extras = requested.filters.slice(baseFilters.length);
    if (extras.length > 3) continue;
    const dateField = visual.dateColumn ?? getDataset(base.dataset)?.defaultDateField;
    if (extras.every((f) => isAllowedRuntimeFilter(f, visual, dateField))) return true;
  }
  return false;
}
