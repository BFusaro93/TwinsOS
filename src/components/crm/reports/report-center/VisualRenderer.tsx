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
import type { ReportColumnDef, ReportFieldType, ReportResult, VisualSpec } from "@/types/crm-reports";
import { formatCellValue, ReportTable } from "./ReportTable";

// ── palette (matches src/components/shared/ReportsPage.tsx conventions) ──────

const SERIES_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];

function colFor(columns: ReportColumnDef[], key: string | undefined) {
  return columns.find((c) => c.key === key);
}

const COMPACT_NUMBER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const COMPACT_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Short axis-tick label for a value of the given column type — money is
 *  integer cents (so "$12.5K", not "1250000"), bps are ÷100 for display. */
function axisTickLabel(value: unknown, type: ReportFieldType): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  switch (type) {
    case "money":
      return COMPACT_DOLLARS.format(n / 100);
    case "percent":
      return `${COMPACT_NUMBER.format(n)}%`;
    case "bps":
      return `${COMPACT_NUMBER.format(n / 100)}%`;
    case "hours":
      return `${COMPACT_NUMBER.format(n)}h`;
    default:
      return COMPACT_NUMBER.format(n);
  }
}

/** Sort comparator over RAW cell values for a column type — dates
 *  chronologically, numeric types numerically, everything else by label. */
function compareRaw(a: unknown, b: unknown, type: ReportFieldType): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
  switch (type) {
    case "date":
    case "datetime": {
      const ta = Date.parse(String(a));
      const tb = Date.parse(String(b));
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      return String(a).localeCompare(String(b));
    }
    case "money":
    case "number":
    case "hours":
    case "percent":
    case "bps": {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    }
    default:
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
}

/** "Partial" hint for single-number visuals whose underlying query hit the
 *  engine's row limit — the aggregate shown covers only the returned page. */
function PartialHint({ result }: { result: ReportResult }) {
  if (!result.truncated) return null;
  return (
    <p className="text-center text-xs text-amber-600">
      Partial — based on {result.rowCount.toLocaleString()}
      {result.totalCount !== undefined ? ` of ${result.totalCount.toLocaleString()}` : ""} rows
    </p>
  );
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
      {result.rowCount > 1 && !result.truncated && (
        <p className="text-xs text-muted-foreground">across {result.rowCount} rows</p>
      )}
      <PartialHint result={result} />
    </div>
  );
}

function GaugeVisual({ result, visual }: { result: ReportResult; visual: VisualSpec }) {
  const col = colFor(result.columns, visual.kpiColumn);
  const row = result.rows[0];
  const raw = col && row ? row[col.key] : undefined;
  const value = typeof raw === "number" ? raw : Number(raw) || 0;

  const budgetCol = colFor(result.columns, visual.budgetColumn);
  const budgetRaw = budgetCol && row ? row[budgetCol.key] : undefined;
  const budgetValue = typeof budgetRaw === "number" ? budgetRaw : Number(budgetRaw) || 0;
  const hasBudget = !!budgetCol && budgetValue > 0;

  const max = hasBudget ? budgetValue : visual.gaugeMax && visual.gaugeMax > 0 ? visual.gaugeMax : value || 1;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="flex h-full flex-col justify-center gap-3 py-4">
      <p className="text-center text-2xl font-bold text-slate-900">
        {col && raw !== undefined ? formatCellValue(raw, col.type) : "—"}
      </p>
      {hasBudget && (
        <p className="text-center text-xs text-muted-foreground">
          of {formatCellValue(budgetValue, budgetCol.type)} budgeted
        </p>
      )}
      <div className="relative px-1">
        <div
          className="absolute -top-2.5 -translate-x-1/2 text-slate-700"
          style={{ left: `${pct}%` }}
        >
          ▼
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          <div className="flex-1 bg-red-400" />
          <div className="flex-1 bg-yellow-400" />
          <div className="flex-1 bg-green-500" />
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>0</span>
        <span>{col ? formatCellValue(max, col.type) : max}</span>
      </div>
      <PartialHint result={result} />
    </div>
  );
}

function CrosstabVisual({ result, visual }: { result: ReportResult; visual: VisualSpec }) {
  const labelCol = colFor(result.columns, visual.labelColumn);
  const headerCol = colFor(result.columns, visual.crosstabHeaderColumn);
  const valueCol = colFor(result.columns, visual.valueColumns[0]);

  if (!labelCol || !headerCol || !valueCol) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Choose a row label, header, and value column.
      </div>
    );
  }

  // A client-side pivot of an already-flat, already-aggregated query result
  // (grouped by both labelCol and headerCol) — no backend changes needed.
  // Header order is decided on the RAW header values (so date headers come
  // out chronologically and numbers numerically) — sorting the formatted
  // labels would put "Aug 2026" before "Jul 2026".
  const headerRawByLabel = new Map<string, unknown>();
  const rowOrder: string[] = [];
  const rowSeen = new Set<string>();
  const cellMap = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const row of result.rows) {
    const rowLabel = formatCellValue(row[labelCol.key], labelCol.type);
    const headerRaw = row[headerCol.key];
    const headerLabel = formatCellValue(headerRaw, headerCol.type);
    const value = Number(row[valueCol.key]) || 0;
    if (!rowSeen.has(rowLabel)) {
      rowSeen.add(rowLabel);
      rowOrder.push(rowLabel);
    }
    if (!headerRawByLabel.has(headerLabel)) headerRawByLabel.set(headerLabel, headerRaw);
    const cellKey = `${rowLabel}|${headerLabel}`;
    cellMap.set(cellKey, (cellMap.get(cellKey) ?? 0) + value);
    rowTotals.set(rowLabel, (rowTotals.get(rowLabel) ?? 0) + value);
    colTotals.set(headerLabel, (colTotals.get(headerLabel) ?? 0) + value);
    grandTotal += value;
  }
  const headerValues = [...headerRawByLabel.entries()]
    .sort(([, a], [, b]) => compareRaw(a, b, headerCol.type))
    .map(([label]) => label);

  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="whitespace-nowrap px-3 py-2 text-left">{labelCol.label}</th>
            {headerValues.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 text-right">
                {h}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rowOrder.map((r) => (
            <tr key={r} className="border-b last:border-0 hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{r}</td>
              {headerValues.map((h) => {
                const v = cellMap.get(`${r}|${h}`);
                return (
                  <td key={h} className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {v === undefined ? "—" : formatCellValue(v, valueCol.type)}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                {formatCellValue(rowTotals.get(r) ?? 0, valueCol.type)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-slate-50 font-medium text-slate-800">
            <td className="px-3 py-2">Total</td>
            {headerValues.map((h) => (
              <td key={h} className="px-3 py-2 text-right tabular-nums">
                {formatCellValue(colTotals.get(h) ?? 0, valueCol.type)}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums">
              {formatCellValue(grandTotal, valueCol.type)}
            </td>
          </tr>
        </tfoot>
      </table>
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

  let data = result.rows.map((row) => {
    const point: Record<string, unknown> = {
      __label: formatCellValue(row[labelCol.key], labelCol.type),
    };
    for (const vc of valueCols) point[vc.key] = Number(row[vc.key]) || 0;
    return point;
  });

  // Bar/pie only — a line chart's categories are usually a time series where
  // "top N" doesn't apply. Ranks by the first value column's magnitude so a
  // chart with many long-tail categories (e.g. 50 lead sources) stays
  // readable instead of rendering an unreadable wall of slices/bars.
  if ((visual.type === "bar" || visual.type === "pie") && visual.topN && data.length > visual.topN) {
    const primaryKey = valueCols[0].key;
    const sorted = [...data].sort(
      (a, b) => Math.abs(Number(b[primaryKey])) - Math.abs(Number(a[primaryKey]))
    );
    const top = sorted.slice(0, visual.topN);
    const rest = sorted.slice(visual.topN);
    if (visual.showOthers && rest.length > 0) {
      const othersPoint: Record<string, unknown> = { __label: "Others" };
      for (const vc of valueCols) {
        othersPoint[vc.key] = rest.reduce((sum, r) => sum + (Number(r[vc.key]) || 0), 0);
      }
      data = [...top, othersPoint];
    } else {
      data = top;
    }
  }

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

  // Recharts passes the series' display `name` (a label, e.g. "Sum of
  // Balance") as the 2nd formatter arg, not its data key — matching that
  // against column keys always misses. The dataKey lives on the 3rd arg.
  const tooltipFormatter = (v: number, _name: string, item: { dataKey?: string | number }) => {
    const c = colFor(result.columns, item?.dataKey !== undefined ? String(item.dataKey) : undefined);
    return c ? formatCellValue(v, c.type) : v;
  };

  // All series share one Y axis, so ticks are formatted by the first value
  // column's type (money in cents would otherwise read as raw "1250000").
  const yTickFormatter = (v: unknown) => axisTickLabel(v, valueCols[0].type);

  if (visual.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="__label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={yTickFormatter} />
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
        <YAxis tick={{ fontSize: 11 }} tickFormatter={yTickFormatter} />
        <Tooltip formatter={tooltipFormatter} />
        {valueCols.length > 1 && <Legend />}
        {valueCols.map((vc, i) => (
          <Bar
            key={vc.key}
            dataKey={vc.key}
            name={vc.label}
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            radius={[4, 4, 0, 0]}
            stackId={visual.stacked ? "stack" : undefined}
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
  if (visual.type === "gauge") {
    return (
      <div className={className}>
        <GaugeVisual result={result} visual={visual} />
      </div>
    );
  }
  if (visual.type === "table") {
    return (
      <div className={cn("max-h-72 overflow-auto", className)}>
        <ReportTable
          result={result}
          formatRules={visual.formatRules}
          colorSpectrumColumns={visual.colorSpectrumColumns}
        />
      </div>
    );
  }
  if (visual.type === "crosstab") {
    return (
      <div className={className}>
        <CrosstabVisual result={result} visual={visual} />
      </div>
    );
  }
  return (
    <div className={className}>
      <ChartVisual result={result} visual={visual} />
    </div>
  );
}
