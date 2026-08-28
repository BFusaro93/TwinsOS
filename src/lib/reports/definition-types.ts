import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisConfig,
  FormatRule,
  ReportFilterDef,
  ReportResult,
  ReportSectionKey,
} from "@/types/crm-reports";

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
  analysis?: (params: ReportParams) => AnalysisConfig;
  run?: (ctx: ReportContext) => Promise<ReportResult>;
  href?: string;
}
