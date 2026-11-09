import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ReportExportDocument } from "@/components/crm/reports/pdf/ReportExportDocument";
import { runAnalysis } from "@/lib/reports/engine";
import { isCustomFieldKey } from "@/lib/reports/datasets";
import { buildGroupedPdfSection } from "@/lib/reports/pdf-grouping";
import { buildTotalsRow, exportRowsWithTotals } from "@/lib/reports/export-rows";
import { analysisScheduleProblem, withDateWindow } from "@/lib/reports/scheduled-analysis";
import type { DateWindow } from "@/lib/reports/schedule-date-window";
import {
  exportCellValueServer,
  formatCellValueServer,
  type RenderedScheduledReport,
  type ScheduledReportFormat,
} from "@/lib/reports/run-scheduled";
import { xlsxBuffer } from "@/lib/xlsx-export";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { resultCellColors } from "@/lib/reports/cell-colors";
import { aggregateExportRows, type ViewAggregateFn } from "@/lib/reports/table-view";
import type { AnalysisConfig, FormatRule, ReportFieldType } from "@/types/crm-reports";

/**
 * Runs a SAVED custom analysis for a schedule and renders it. `config` must be
 * loaded server-side from the saved row (never from a request). The query goes
 * through crm_run_report_for_org, which is scoped to `orgId` in SQL (injected
 * org_id filter; datasets without an org_id column are refused) and resolves
 * the org's clock for `userId`, the schedule's creator. Throws a user-facing
 * message when the analysis can't be run headlessly.
 */
export async function renderScheduledAnalysis(
  supabase: SupabaseClient,
  input: {
    name: string;
    config: AnalysisConfig;
    orgId: string;
    userId: string;
    format: ScheduledReportFormat;
    dateColumn: string | null;
    dateWindow: DateWindow | null;
    now: Date;
    /** The saved analysis's cell coloring — same as on screen. */
    formatRules?: FormatRule[];
    colorSpectrumColumns?: string[];
    /** The saved analysis's column footer summaries. */
    tableAggregates?: Record<string, ViewAggregateFn>;
  }
): Promise<RenderedScheduledReport> {
  const { name, orgId, userId, format } = input;
  const problem = analysisScheduleProblem(input.config);
  if (problem) throw new Error(problem);

  // The engine/RPC look custom-field defs up by id without org scope; make
  // sure every referenced def is this org's before running.
  const cfIds = [
    ...new Set(
      [
        ...input.config.columns,
        ...input.config.groupBy,
        ...input.config.aggregates.map((a) => a.column),
        ...input.config.filters.map((f) => f.column),
      ]
        .filter(isCustomFieldKey)
        .map((k) => k.slice(3).toLowerCase())
    ),
  ];
  if (cfIds.length > 0) {
    const { data } = await supabase
      .from("crm_custom_field_defs")
      .select("id")
      .in("id", cfIds)
      .eq("org_id", orgId)
      .is("deleted_at", null);
    if ((data ?? []).length !== cfIds.length) throw new Error("The analysis uses a custom field that no longer exists.");
  }

  const timeZone = await getOrgTimeZone(supabase, orgId);
  const config = withDateWindow(input.config, input.dateColumn, input.dateWindow, input.now, timeZone);
  const result = await runAnalysis(supabase, config, {
    name: "crm_run_report_for_org",
    extraArgs: { p_org_id: orgId, p_user_id: userId },
  });
  const baseName = name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "Analysis";
  const meta = { truncated: result.truncated ?? false, rowCount: result.rowCount, totalCount: result.totalCount };

  if (format === "xlsx") {
    const rows = result.truncated
      ? result.rows.map((row) => result.columns.map((c) => exportCellValueServer(row[c.key], c.type, timeZone)))
      : exportRowsWithTotals(result, (v, t) => exportCellValueServer(v, t, timeZone));
    const content = await xlsxBuffer([
      {
        name: name.slice(0, 31) || "Analysis",
        headers: result.columns.map((c) => c.label),
        // Like the totals row, summaries are left off a partial (row-capped) result.
        rows: result.truncated
          ? rows
          : [...rows, ...aggregateExportRows(result.columns, result.rows, input.tableAggregates ?? {}, (v, t) => exportCellValueServer(v, t, timeZone))],
        cellColors: resultCellColors(result, input.formatRules, input.colorSpectrumColumns),
      },
    ]);
    return { content, filename: `${baseName}.xlsx`, ...meta };
  }

  const fmt = (v: unknown, t: ReportFieldType) => formatCellValueServer(v, t, timeZone);
  const grouped = buildGroupedPdfSection(result, fmt) ?? undefined;
  const partialNotice = result.truncated
    ? `Partial report — only the first ${result.rowCount.toLocaleString("en-US")}` +
      (result.totalCount !== undefined ? ` of ${result.totalCount.toLocaleString("en-US")}` : "") +
      " matching rows are included, so any totals cover those rows only."
    : undefined;
  const buffer = await renderToBuffer(
    createElement(ReportExportDocument, {
      title: name,
      generatedAt: new Date().toLocaleString("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }),
      notice: partialNotice,
      charts: [],
      sections: [
        {
          heading: "",
          columns: grouped ? grouped.columns : result.columns.map((c) => c.label),
          rows: grouped ? [] : result.rows.map((row) => result.columns.map((c) => fmt(row[c.key], c.type))),
          totals: grouped || result.truncated ? undefined : buildTotalsRow(result, fmt) ?? undefined,
          grouped,
          cellColors: grouped ? undefined : resultCellColors(result, input.formatRules, input.colorSpectrumColumns),
          footers:
            grouped || result.truncated
              ? undefined
              : aggregateExportRows(result.columns, result.rows, input.tableAggregates ?? {}, fmt),
        },
      ],
    })
  );
  return { content: Buffer.from(buffer), filename: `${baseName}.pdf`, ...meta };
}
