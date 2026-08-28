import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisConfig,
  FormatRule,
  ReportFilterDef,
  ReportResult,
  ReportSectionKey,
  VisualSpec,
} from "@/types/crm-reports";

/** A chart shown above a report's table — both on screen and (as a simple
 *  bar chart) embedded in the PDF export. */
export interface ReportHeaderVisual {
  title: string;
  visual: VisualSpec;
}

/** Flattened URL query params from the report viewer's filter bar. */
export type ReportParams = Record<string, string>;

export interface ReportContext {
  /** Authenticated, RLS-scoped server client. */
  supabase: SupabaseClient;
  params: ReportParams;
}

/**
 * A pre-built report in the Report Center catalog. Exactly one of:
 *  - `analysis` — declarative: build an AnalysisConfig from the filter params,
 *    executed through the crm_run_report RPC (most reports)
 *  - `run` — bespoke handler for shapes the generic engine can't produce
 *    (aging buckets, month-column matrices, multi-table summaries)
 *  - `href` — an existing standalone report page to link to
 */
export interface PrebuiltReportDef {
  key: string;
  section: ReportSectionKey;
  name: string;
  description: string;
  filters: ReportFilterDef[];
  /** SA-style column-definition footnotes shown under the table. */
  notes?: string[];
  /** Cell color-coding for the table view — same shape as a saved analysis's formatRules. */
  formatRules?: FormatRule[];
  /** Charts rendered above the table (and embedded in the PDF export) — e.g. a
   *  bar chart of the same data grouped a different way. Built from `params`
   *  so date-window filters can match whatever the table itself is showing. */
  headerVisuals?: (params: ReportParams) => ReportHeaderVisual[];
  analysis?: (params: ReportParams) => AnalysisConfig;
  run?: (ctx: ReportContext) => Promise<ReportResult>;
  href?: string;
  /** Can be scheduled for daily email delivery (report_schedules). Only
   *  makes sense for reports whose `analysis` needs no per-run filter
   *  params — a fixed date window it recomputes itself each run, not a
   *  user-picked range that would otherwise go stale. */
  schedulable?: boolean;
}
