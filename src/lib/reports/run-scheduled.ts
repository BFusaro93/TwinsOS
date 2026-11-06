import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReportExportDocument } from "@/components/crm/reports/pdf/ReportExportDocument";
import type { ReportExportChart } from "@/components/crm/reports/pdf/ReportExportDocument";
import { runAnalysis } from "@/lib/reports/engine";
import { buildGroupedPdfSection } from "@/lib/reports/pdf-grouping";
import { buildTotalsRow, exportRowsWithTotals } from "@/lib/reports/export-rows";
import { xlsxBuffer } from "@/lib/xlsx-export";
import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import type { ReportColumnDef, ReportFieldType, ReportResult } from "@/types/crm-reports";
import { getOrgTimeZone } from "@/lib/time/org-timezone";

// The cron runs on a UTC server with no user session, so every wall-clock
// rendering has to pin the ORG's zone explicitly — it can't be inferred from
// the host the way the browser path infers it from the user's machine. It is
// resolved once per report in renderScheduledReport and threaded down.

/** Standalone copy of ReportTable's `formatCellValue` — that file is a
 *  "use client" component; duplicated here rather than imported so this
 *  server-only path (the report-schedules cron) has no dependency on it.
 *  Differs on `datetime`: the date part is formatted in the org's zone too
 *  (utils.formatDate uses the host timezone, which is UTC on Vercel and would
 *  roll an evening timestamp onto the next day). */
export function formatCellValueServer(value: unknown, type: ReportFieldType, timeZone: string): string {
  if (value === null || value === undefined) return "—";
  switch (type) {
    case "money":
      return formatCurrency(Number(value));
    case "hours":
      return Number(value).toFixed(2);
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "bps":
      return `${(Number(value) / 100).toFixed(1)}%`;
    case "number":
      return Number(value).toLocaleString();
    case "date":
      return formatDate(String(value));
    case "datetime": {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return "—";
      const date = new Intl.DateTimeFormat("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
      const time = d.toLocaleTimeString("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${date} ${time}`;
    }
    case "boolean":
      return value === true || value === "true" ? "Yes" : "No";
    default:
      return String(value);
  }
}

function chartFromResult(title: string, result: ReportResult, timeZone: string): ReportExportChart | null {
  const labelCol: ReportColumnDef | undefined = result.columns[0];
  const valueCol: ReportColumnDef | undefined = result.columns[1];
  if (!labelCol || !valueCol) return null;
  return {
    title,
    bars: result.rows.map((row) => ({
      label: String(row[labelCol.key] ?? ""),
      value: typeof row[valueCol.key] === "number" ? (row[valueCol.key] as number) : 0,
      valueLabel: formatCellValueServer(row[valueCol.key], valueCol.type, timeZone),
    })),
  };
}

/** Server copy of ReportTable's `exportCellValue` (a "use client" file):
 *  numeric types stay real numbers (money cents → dollars) so the emailed
 *  spreadsheet sorts and sums; everything else is the org-zone display
 *  string. Must match the on-screen Excel button's output. */
export function exportCellValueServer(value: unknown, type: ReportFieldType, timeZone: string): string | number {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "money":
      return Number(value) / 100;
    case "hours":
    case "number":
    case "percent":
      return Number(value);
    case "bps":
      return Number(value) / 100;
    default:
      return formatCellValueServer(value, type, timeZone);
  }
}

export type ScheduledReportFormat = "pdf" | "xlsx";

export interface RenderedScheduledReport {
  content: Buffer;
  filename: string;
  /** The engine hit its row cap — the attachment is partial. */
  truncated: boolean;
  rowCount: number;
  totalCount?: number;
}

/** Runs a schedulable report for one org (see runScheduledReportQuery) and
 *  renders it in the schedule's format. */
export async function renderScheduledReport(
  supabase: SupabaseClient,
  def: PrebuiltReportDef,
  orgId: string,
  format: ScheduledReportFormat
): Promise<RenderedScheduledReport> {
  const baseName = def.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "Report";
  if (format === "xlsx") {
    const timeZone = await getOrgTimeZone(supabase, orgId);
    const result = await runScheduledReportQuery(supabase, def, orgId, timeZone);
    // Same sheet as the on-screen Excel button, except a truncated result
    // leaves the totals row off (it would only total the returned rows —
    // matches the PDF's behavior).
    const rows = result.truncated
      ? result.rows.map((row) => result.columns.map((c) => exportCellValueServer(row[c.key], c.type, timeZone)))
      : exportRowsWithTotals(result, (v, t) => exportCellValueServer(v, t, timeZone));
    const content = xlsxBuffer([{ name: def.name, headers: result.columns.map((c) => c.label), rows }]);
    return {
      content,
      filename: `${baseName}.xlsx`,
      truncated: result.truncated ?? false,
      rowCount: result.rowCount,
      totalCount: result.totalCount,
    };
  }
  const pdf = await renderScheduledReportPdf(supabase, def, orgId);
  return { ...pdf, filename: `${baseName}.pdf` };
}

/** The def's analysis for one org, scoped explicitly to `orgId`: `supabase`
 *  is a service-role client (no user session for RLS to scope by), so an
 *  org_id filter is injected on top of the def's own filters. */
async function runScheduledReportQuery(
  supabase: SupabaseClient,
  def: PrebuiltReportDef,
  orgId: string,
  timeZone: string
): Promise<ReportResult> {
  if (!def.analysis) {
    throw new Error(`Report "${def.key}" has no analysis() — cannot run headlessly.`);
  }
  const config = def.analysis({}, timeZone);
  config.filters = [...config.filters, { column: "org_id", op: "eq", value: orgId }];
  return runAnalysis(supabase, config);
}

/** Runs a schedulable PrebuiltReportDef's `analysis` (and headerVisuals, if
 *  any) for one org and renders the result as a PDF buffer — the same shape
 *  as the on-screen "PDF" export button, minus the browser round-trip.
 *  `supabase` must be a service-role client (no user session exists in the
 *  cron context RLS could scope by), so every query is explicitly scoped to
 *  `orgId` via an org_id filter injected on top of the def's own filters. */
async function renderScheduledReportPdf(
  supabase: SupabaseClient,
  def: PrebuiltReportDef,
  orgId: string
): Promise<Omit<RenderedScheduledReport, "filename">> {
  // Every date boundary and wall-clock rendering below belongs to THIS org.
  const timeZone = await getOrgTimeZone(supabase, orgId);
  const result = await runScheduledReportQuery(supabase, def, orgId, timeZone);

  const headerVisuals = def.headerVisuals?.({}, timeZone) ?? [];
  const chartResults = await Promise.all(
    headerVisuals.map(async (hv) => {
      const visualConfig = {
        ...hv.visual.config,
        filters: [...hv.visual.config.filters, { column: "org_id", op: "eq" as const, value: orgId }],
      };
      const chartResult = await runAnalysis(supabase, visualConfig);
      return chartFromResult(hv.title, chartResult, timeZone);
    })
  );
  const charts = chartResults.filter((c): c is ReportExportChart => c !== null);

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const grouped = buildGroupedPdfSection(result, (v, t) => formatCellValueServer(v, t, timeZone)) ?? undefined;
  // The report engine stops at its row cap. The emailed PDF used to look complete and
  // carried a totals row computed from only the returned rows; say it's partial instead
  // and leave the misleading flat totals off.
  const partialNotice = result.truncated
    ? `Partial report — only the first ${result.rowCount.toLocaleString("en-US")}` +
      (result.totalCount !== undefined ? ` of ${result.totalCount.toLocaleString("en-US")}` : "") +
      " matching rows are included, so any totals cover those rows only. Open the report in the app with a narrower range for the full result."
    : undefined;
  const buffer = await renderToBuffer(
    createElement(ReportExportDocument, {
      title: def.name,
      generatedAt,
      notice: partialNotice,
      charts,
      sections: [
        {
          heading: "",
          columns: grouped ? grouped.columns : result.columns.map((c) => c.label),
          rows: grouped ? [] : result.rows.map((row) => result.columns.map((c) => formatCellValueServer(row[c.key], c.type, timeZone))),
          totals: grouped || result.truncated ? undefined : buildTotalsRow(result, (v, t) => formatCellValueServer(v, t, timeZone)) ?? undefined,
          grouped,
        },
      ],
    })
  );

  return {
    content: Buffer.from(buffer),
    truncated: result.truncated ?? false,
    rowCount: result.rowCount,
    totalCount: result.totalCount,
  };
}
