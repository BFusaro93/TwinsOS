"use client";

import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunReportHeaderVisual, useRunVisualQuery } from "@/lib/hooks/use-report-center";
import type { ReportExportChartInput } from "@/lib/reports/export-pdf";
import type { ReportHeaderVisual } from "@/lib/reports/definition-types";
import type { ReportResult } from "@/types/crm-reports";
import { formatCellValue } from "./ReportTable";
import { VisualRenderer } from "./VisualRenderer";

/** Converts a header visual's fetched result into the flat {label, value}
 *  shape the PDF export renders as a simple bar chart — the on-screen
 *  visual can be any chart type, but the PDF always redraws it as bars
 *  (see ReportExportDocument.tsx), so only the first two columns matter:
 *  the first is the label, the second the value. */
export function chartInputFromResult(
  title: string,
  result: ReportResult
): ReportExportChartInput | null {
  const labelCol = result.columns[0];
  const valueCol = result.columns[1];
  if (!labelCol || !valueCol) return null;
  return {
    title,
    bars: result.rows.map((row) => ({
      label: String(row[labelCol.key] ?? ""),
      value: typeof row[valueCol.key] === "number" ? (row[valueCol.key] as number) : 0,
      valueLabel: formatCellValue(row[valueCol.key], valueCol.type),
    })),
  };
}

/** Fetches and renders one of a report's `headerVisuals` — a chart shown
 *  above the table. Reports the fetched data back up so the PDF export can
 *  embed the same chart as a simple bar chart. */
export function HeaderVisual({
  headerVisual,
  prebuilt,
  onData,
}: {
  headerVisual: ReportHeaderVisual;
  /** Set for a prebuilt report's chart: the server rebuilds the query from
   *  the report definition instead of running the client's config through
   *  the custom-analysis endpoint (an Advanced Reporting feature). */
  prebuilt?: { reportKey: string; params: Record<string, string>; index: number };
  onData?: (title: string, result: ReportResult) => void;
}) {
  const custom = useRunVisualQuery(prebuilt ? undefined : headerVisual.visual);
  const fromReport = useRunReportHeaderVisual(prebuilt);
  const { data, isFetching, error } = prebuilt ? fromReport : custom;

  useEffect(() => {
    if (data) onData?.(headerVisual.title, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, headerVisual.title]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{headerVisual.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isFetching && !data ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : data ? (
          <VisualRenderer result={data} visual={headerVisual.visual} className="h-48" />
        ) : null}
      </CardContent>
    </Card>
  );
}
