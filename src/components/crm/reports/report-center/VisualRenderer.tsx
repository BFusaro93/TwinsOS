"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ReportColumnDef, ReportResult, VisualSpec } from "@/types/crm-reports";
import { formatCellValue, ReportTable } from "./ReportTable";

// ── palette (matches src/components/shared/ReportsPage.tsx conventions) ──────

const SERIES_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];

function colFor(columns: ReportColumnDef[], key: string | undefined) {
  return columns.find((c) => c.key === key);
}

function KpiVisual({ result, visual }: { result: ReportResult; visual: VisualSpec }) {
  const col = colFor(result.columns, visual.kpiColumn);
  const row = result.rows[0];
  const raw = col && row ? row[col.key] : undefined;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-4">
      <p className="text-3xl font-bold text-slate-900">
        {col && raw !== undefined ? formatCellValue(raw, col.type) : "—"}
      </p>
      {result.rowCount > 1 && (
        <p className="text-xs text-muted-foreground">across {result.rowCount} rows</p>
      )}
    </div>
  );
}

function ChartVisual({ result, visual }: { result: ReportResult; visual: VisualSpec }) {
  const labelCol = colFor(result.columns, visual.labelColumn);
  const valueCols = visual.valueColumns
    .map((key) => colFor(result.columns, key))
    .filter((c): c is ReportColumnDef => !!c);

  if (!labelCol || valueCols.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Choose a label and at least one value column.
      </div>
    );
  }

  const data = result.rows.map((row) => {
    const point: Record<string, unknown> = {
      __label: formatCellValue(row[labelCol.key], labelCol.type),
    };
    for (const vc of valueCols) point[vc.key] = Number(row[vc.key]) || 0;
    return point;
  });

  if (visual.type === "pie") {
    const valueCol = valueCols[0];
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueCol.key}
            nameKey="__label"
            cx="50%"
            cy="50%"
            outerRadius={90}
            label={(entry) => entry.__label}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatCellValue(v, valueCol.type)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const tooltipFormatter = (v: number, name: string) => {
    const c = colFor(result.columns, name);
    return c ? formatCellValue(v, c.type) : v;
  };

  if (visual.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="__label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={tooltipFormatter} />
          {valueCols.length > 1 && <Legend />}
          {valueCols.map((vc, i) => (
            <Line
              key={vc.key}
              dataKey={vc.key}
              name={vc.label}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="__label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={tooltipFormatter} />
        {valueCols.length > 1 && <Legend />}
        {valueCols.map((vc, i) => (
          <Bar
            key={vc.key}
            dataKey={vc.key}
            name={vc.label}
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VisualRenderer({
  result,
  visual,
  className,
}: {
  result: ReportResult;
  visual: VisualSpec;
  className?: string;
}) {
  if (result.rows.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center text-xs text-slate-400", className)}>
        No data for the current filters.
      </div>
    );
  }
  if (visual.type === "kpi") {
    return (
      <div className={className}>
        <KpiVisual result={result} visual={visual} />
      </div>
    );
  }
  if (visual.type === "table") {
    return (
      <div className={cn("max-h-72 overflow-auto", className)}>
        <ReportTable result={result} />
      </div>
    );
  }
  return (
    <div className={className}>
      <ChartVisual result={result} visual={visual} />
    </div>
  );
}
