"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, Printer } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV } from "@/lib/csv";
import { useRunReport } from "@/lib/hooks/use-report-center";
import { getReport } from "@/lib/reports/registry";
import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import type { ReportFilterDef } from "@/types/crm-reports";
import {
  computePresetRange,
  ReportFilterBar,
} from "./ReportFilterBar";
import { formatCellValue, ReportTable } from "./ReportTable";

const HUB_HREF = "/crm/admin/reports?tab=center";

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

function BackLink() {
  return (
    <Link
      href={HUB_HREF}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Report Center
    </Link>
  );
}

function LinkOutCard({ def }: { def: PrebuiltReportDef }) {
  const router = useRouter();

  useEffect(() => {
    if (def.href) router.replace(def.href);
  }, [def.href, router]);

  return (
    <div className="p-6">
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

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="print:hidden">
        <BackLink />
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{def.name}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{def.description}</p>
      </div>

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
                Export CSV
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
      <div className="p-6">
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
      </div>
    );
  }

  if (def.href) return <LinkOutCard def={def} />;

  return <PrebuiltReportRunner def={def} />;
}
