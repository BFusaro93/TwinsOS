import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReportExportDocument } from "@/components/crm/reports/pdf/ReportExportDocument";
import type { ReportExportChart } from "@/components/crm/reports/pdf/ReportExportDocument";
import { runAnalysis } from "@/lib/reports/engine";
import { buildGroupedPdfSection } from "@/lib/reports/pdf-grouping";
import { buildTotalsRow } from "@/lib/reports/export-rows";
import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import type { ReportColumnDef, ReportFieldType, ReportResult } from "@/types/crm-reports";

/** The org's operating timezone — the cron runs on a UTC server, so every
 *  wall-clock rendering has to pin this explicitly (the browser path gets
 *  it for free from the user's machine). */
const REPORT_TZ = "America/New_York";

/** Standalone copy of ReportTable's `formatCellValue` — that file is a
 *  "use client" component; duplicated here rather than imported so this
 *  server-only path (the report-schedules cron) has no dependency on it.
 *  Differs on `datetime`: the date part is formatted in America/New_York
 *  too (utils.formatDate uses the host timezone, which is UTC on Vercel
 *  and would roll an evening timestamp onto the next day). */
function formatCellValueServer(value: unknown, type: ReportFieldType): string {
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
        timeZone: REPORT_TZ,
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
      const time = d.toLocaleTimeString("en-US", {
        timeZone: REPORT_TZ,
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

function chartFromResult(title: string, result: ReportResult): ReportExportChart | null {
  const labelCol: ReportColumnDef | undefined = result.columns[0];
  const valueCol: ReportColumnDef | undefined = result.columns[1];
  if (!labelCol || !valueCol) return null;
  return {
    title,
    bars: result.rows.map((row) => ({
      label: String(row[labelCol.key] ?? ""),
      value: typeof row[valueCol.key] === "number" ? (row[valueCol.key] as number) : 0,
      valueLabel: formatCellValueServer(row[valueCol.key], valueCol.type),
    })),
  };
}

/** Runs a schedulable PrebuiltReportDef's `analysis` (and headerVisuals, if
 *  any) for one org and renders the result as a PDF buffer — the same shape
 *  as the on-screen "PDF" export button, minus the browser round-trip.
 *  `supabase` must be a service-role client (no user session exists in the
 *  cron context RLS could scope by), so every query is explicitly scoped to
 *  `orgId` via an org_id filter injected on top of the def's own filters. */
export async function renderScheduledReportPdf(
  supabase: SupabaseClient,
  def: PrebuiltReportDef,
  orgId: string
): Promise<Buffer> {
  if (!def.analysis) {
    throw new Error(`Report "${def.key}" has no analysis() — cannot run headlessly.`);
  }

  const config = def.analysis({});
  config.filters = [...config.filters, { column: "org_id", op: "eq", value: orgId }];
  const result = await runAnalysis(supabase, config);

  const headerVisuals = def.headerVisuals?.({}) ?? [];
  const chartResults = await Promise.all(
    headerVisuals.map(async (hv) => {
      const visualConfig = {
        ...hv.visual.config,
        filters: [...hv.visual.config.filters, { column: "org_id", op: "eq" as const, value: orgId }],
      };
      const chartResult = await runAnalysis(supabase, visualConfig);
      return chartFromResult(hv.title, chartResult);
    })
  );
  const charts = chartResults.filter((c): c is ReportExportChart => c !== null);

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: REPORT_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const grouped = buildGroupedPdfSection(result, formatCellValueServer) ?? undefined;
  const buffer = await renderToBuffer(
    createElement(ReportExportDocument, {
      title: def.name,
      generatedAt,
      charts,
      sections: [
        {
          heading: "",
          columns: grouped ? grouped.columns : result.columns.map((c) => c.label),
          rows: grouped ? [] : result.rows.map((row) => result.columns.map((c) => formatCellValueServer(row[c.key], c.type))),
          totals: grouped ? undefined : buildTotalsRow(result, formatCellValueServer) ?? undefined,
          grouped,
        },
      ],
    })
  );

  return Buffer.from(buffer);
}
