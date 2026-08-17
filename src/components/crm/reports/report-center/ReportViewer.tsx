"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx-export";
import { exportReportPDF } from "@/lib/reports/export-pdf";
import { useRunReport } from "@/lib/hooks/use-report-center";
import { getReport } from "@/lib/reports/registry";
import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import type { ReportFilterDef } from "@/types/crm-reports";
import {
  computePresetRange,
  ReportFilterBar,
} from "./ReportFilterBar";
import { exportCellValue, formatCellValue, ReportTable } from "./ReportTable";

const HUB_HREF = "/crm/admin/reports?tab=center";

function BackButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => router.push(HUB_HREF)}
    >
      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
      Report Center
    </Button>
  );
}

function initialFilterValues(filters: ReportFilterDef[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const def of filters) {
    if (def.type === "dateRange") {
      const { from, to } = computePresetRange(def.defaultValue ?? "this_month");
      values.from = from;
      values.to = to;
    } else {
      values[def.key] = def.defaultValue ?? "";
    }
  }
  return values;
}

function LinkOutCard({ def }: { def: PrebuiltReportDef }) {
  const router = useRouter();

  useEffect(() => {
    if (def.href) router.replace(def.href);
  }, [def.href, router]);

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        Opening <span className="font-medium">{def.name}</span>…
      </p>
      {def.href && (
        <Link href={def.href} className="mt-2 inline-block text-sm text-blue-600 hover:underline">
          Continue to the report
        </Link>
      )}
    </div>
  );
}

function PrebuiltReportRunner({ def }: { def: PrebuiltReportDef }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialFilterValues(def.filters)
  );
  const { data: result, isFetching, error, refetch } = useRunReport(def.key, values);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = () => {
    if (!result) return;
    downloadCSV(
      `${def.key}.csv`,
      result.columns.map((c) => c.label),
      result.rows.map((row) =>
        result.columns.map((c) => formatCellValue(row[c.key], c.type))
      )
    );
  };

  const handleExportExcel = () => {
    if (!result) return;
    downloadXLSX(`${def.key}.xlsx`, [
      {
        name: def.name,
        headers: result.columns.map((c) => c.label),
        rows: result.rows.map((row) => result.columns.map((c) => exportCellValue(row[c.key], c.type))),
      },
    ]);
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    if (!result) return;
    setExportingPdf(true);
    try {
      await exportReportPDF(def.name, [
        {
          heading: "",
          columns: result.columns.map((c) => c.label),
          rows: result.rows.map((row) => result.columns.map((c) => formatCellValue(row[c.key], c.type))),
        },
      ]);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={def.name}
        description={def.description}
        action={<BackButton />}
        className="print:hidden"
      />

      <div className="print:hidden">
        <ReportFilterBar
          filters={def.filters}
          values={values}
          onChange={handleChange}
          onRefresh={() => void refetch()}
          extraActions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!result || result.rows.length === 0}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={!result || result.rows.length === 0}
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportPdf()}
                disabled={!result || result.rows.length === 0 || exportingPdf}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {exportingPdf ? "Exporting…" : "PDF"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
            </>
          }
        />
      </div>

      {isFetching ? (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Report failed</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : result ? (
        <ReportTable result={result} />
      ) : null}
    </div>
  );
}

export function ReportViewer({ reportKey }: { reportKey: string }) {
  const def = getReport(reportKey);

  if (!def) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-base font-semibold text-slate-900">
          Report not found
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          No report exists with the key &quot;{reportKey}&quot;.
        </p>
        <Link
          href={HUB_HREF}
          className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Report Center
        </Link>
      </div>
    );
  }

  if (def.href) return <LinkOutCard def={def} />;

  return <PrebuiltReportRunner def={def} />;
}
