"use client";

import { useState, useCallback } from "react";
import { useKpiActuals, useUpsertKpiActual } from "@/lib/hooks/use-kpi-actuals";

// ── KPI definitions ───────────────────────────────────────────────────────────

type UnitType = "currency" | "percent" | "number";

interface MetricDef {
  key: string;
  label: string;
  unit: UnitType;
  defaultTarget: number | null;
  weight: number; // percent weight within category (should sum to 100)
  lowerIsBetter?: boolean;
}

interface CategoryDef {
  key: string;
  label: string;
  metrics: MetricDef[];
}

const KPI_CATEGORIES: CategoryDef[] = [
  {
    key: "financial",
    label: "Financial",
    metrics: [
      { key: "revenue_sold",     label: "Revenue (Sold)",     unit: "currency", defaultTarget: 3200000, weight: 25 },
      { key: "revenue_invoiced", label: "Revenue (Invoiced)", unit: "currency", defaultTarget: 3200000, weight: 20 },
      { key: "gross_margin_ytd", label: "Gross Margin YTD",  unit: "percent",  defaultTarget: 50,      weight: 20 },
      { key: "noi_margin_ytd",   label: "NOI Margin YTD",    unit: "percent",  defaultTarget: 20,      weight: 10 },
      { key: "net_margin_ytd",   label: "Net Margin YTD",    unit: "percent",  defaultTarget: 15,      weight: 10 },
      { key: "overhead_ratio",   label: "Overhead Ratio",    unit: "percent",  defaultTarget: 25,      weight: 5, lowerIsBetter: true },
      { key: "ar_days",          label: "AR Days",           unit: "number",   defaultTarget: 30,      weight: 5, lowerIsBetter: true },
      { key: "ap_days",          label: "AP Days",           unit: "number",   defaultTarget: 30,      weight: 5, lowerIsBetter: true },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    metrics: [
      { key: "labor_efficiency",  label: "Labor Efficiency (YTD)",     unit: "percent", defaultTarget: 100, weight: 40 },
      { key: "avb_variance",     label: "AvB Variance (Est vs Actual)", unit: "percent", defaultTarget: 100, weight: 35 },
      { key: "ot_pct_hours",     label: "OT % of Total Hours",         unit: "percent", defaultTarget: 10,  weight: 25, lowerIsBetter: true },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    metrics: [
      { key: "new_clients_ytd",        label: "New Clients YTD",               unit: "number",   defaultTarget: 300,  weight: 30 },
      { key: "lead_conversion_rate",   label: "Lead Conversion Rate",          unit: "percent",  defaultTarget: 45,   weight: 25 },
      { key: "close_ratio",            label: "Close Ratio (Estimates Won %)",  unit: "percent",  defaultTarget: 45,   weight: 25 },
      { key: "new_leads_ytd",          label: "New Leads YTD",                 unit: "number",   defaultTarget: null, weight: 10 },
      { key: "won_estimates_ytd",      label: "Won Estimates YTD",             unit: "currency", defaultTarget: null, weight: 10 },
    ],
  },
  {
    key: "people",
    label: "People",
    metrics: [
      { key: "employee_retention",      label: "Employee Retention",          unit: "percent",  defaultTarget: 80,     weight: 20 },
      { key: "employee_enps",           label: "Employee Engagement eNPS",    unit: "number",   defaultTarget: 60,     weight: 20 },
      { key: "training_hrs_per_emp",    label: "Training Hours Per Employee", unit: "number",   defaultTarget: 24,     weight: 20 },
      { key: "training_completion",     label: "Training Completion Rate",    unit: "percent",  defaultTarget: 100,    weight: 20 },
      { key: "accident_free_workdays",  label: "Accident Free Workdays",      unit: "number",   defaultTarget: 100,    weight: 15 },
      { key: "absenteeism_rate",        label: "Absenteeism Rate",            unit: "percent",  defaultTarget: 3,      weight: 5, lowerIsBetter: true },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(value: number | null, unit: UnitType): string {
  if (value === null || value === undefined) return "";
  if (unit === "currency") {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  }
  if (unit === "percent") return `${value}%`;
  return value.toLocaleString();
}

function placeholder(unit: UnitType): string {
  if (unit === "currency") return "Enter $";
  if (unit === "percent") return "Enter %";
  return "Enter #";
}

function calcProgress(actual: number | null, target: number | null, lowerIsBetter?: boolean): number {
  if (actual === null || target === null || target === 0) return 0;
  if (lowerIsBetter) {
    // Progress = 100% when actual <= target; degrades proportionally above target
    return Math.min(100, Math.round((target / actual) * 100));
  }
  return Math.min(100, Math.round((actual / target) * 100));
}

function calcCategoryScore(
  metrics: MetricDef[],
  actualsMap: Map<string, { targetValue: number | null; actualValue: number | null }>
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of metrics) {
    const saved = actualsMap.get(m.key);
    const target = saved?.targetValue ?? m.defaultTarget;
    const actual = saved?.actualValue ?? null;
    if (actual === null || target === null) continue;
    const progress = calcProgress(actual, target, m.lowerIsBetter);
    weightedSum += progress * m.weight;
    totalWeight += m.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditableCell({
  value,
  unit,
  onSave,
}: {
  value: number | null;
  unit: UnitType;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
  }

  function commit() {
    const parsed = draft.trim() === "" ? null : parseFloat(draft.replace(/[$,%]/g, ""));
    onSave(isNaN(parsed as number) ? null : parsed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        className="w-24 rounded border border-blue-400 px-2 py-0.5 text-right text-sm outline-none ring-1 ring-blue-400"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className={`w-full text-right text-sm ${
        value !== null
          ? "font-medium text-slate-800"
          : "text-slate-400 hover:text-blue-500"
      }`}
      title="Click to edit"
    >
      {value !== null ? formatValue(value, unit) : placeholder(unit)}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-medium text-slate-600">{pct}%</span>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  actualsMap,
  period,
}: {
  category: CategoryDef;
  actualsMap: Map<string, { targetValue: number | null; actualValue: number | null }>;
  period: string;
}) {
  const { mutate: upsert } = useUpsertKpiActual();
  const score = calcCategoryScore(category.metrics, actualsMap);

  const scoreColor =
    score >= 90 ? "bg-green-500" : score >= 60 ? "bg-blue-500" : score >= 30 ? "bg-amber-400" : "bg-slate-400";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
        <h2 className="text-xl font-bold text-slate-800">{category.label}</h2>
        <div className={`flex h-10 w-16 items-center justify-center rounded-full ${scoreColor} text-sm font-bold text-white shadow-sm`}>
          {score}%
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 text-left">Metric</th>
              <th className="border-l border-slate-200 px-4 py-3 text-right">Target</th>
              <th className="border-l border-slate-200 px-4 py-3 text-right">Actual</th>
              <th className="border-l border-slate-200 px-4 py-3 text-right">Progress</th>
              <th className="border-l border-slate-200 px-4 py-3 text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {category.metrics.map((metric, idx) => {
              const saved = actualsMap.get(metric.key);
              const target = saved?.targetValue ?? metric.defaultTarget;
              const actual = saved?.actualValue ?? null;
              const pct = calcProgress(actual, target, metric.lowerIsBetter);

              return (
                <tr
                  key={metric.key}
                  className={`border-b border-slate-100 last:border-0 ${
                    idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                  }`}
                >
                  <td className="px-5 py-3 font-medium text-slate-700">{metric.label}</td>

                  {/* Target */}
                  <td className="border-l border-slate-100 px-4 py-3">
                    <EditableCell
                      value={target}
                      unit={metric.unit}
                      onSave={(v) =>
                        upsert({ period, metricKey: metric.key, targetValue: v })
                      }
                    />
                  </td>

                  {/* Actual */}
                  <td className="border-l border-slate-100 px-4 py-3">
                    <EditableCell
                      value={actual}
                      unit={metric.unit}
                      onSave={(v) =>
                        upsert({ period, metricKey: metric.key, actualValue: v })
                      }
                    />
                  </td>

                  {/* Progress */}
                  <td className="border-l border-slate-100 px-4 py-3">
                    <ProgressBar pct={pct} />
                  </td>

                  {/* Weight */}
                  <td className="border-l border-slate-100 px-4 py-3 text-right font-medium text-slate-600">
                    {metric.weight}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function KpiDashboard() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1].map(String);
  const [period, setPeriod] = useState(String(currentYear));

  const { data: actuals = [] } = useKpiActuals(period);

  // Build a lookup map: metricKey → { targetValue, actualValue }
  const actualsMap = useCallback(() => {
    const map = new Map<string, { targetValue: number | null; actualValue: number | null }>();
    for (const a of actuals) {
      map.set(a.metricKey, { targetValue: a.targetValue, actualValue: a.actualValue });
    }
    return map;
  }, [actuals])();

  const lastUpdated = actuals.reduce<string | null>((latest, a) => {
    if (!a.updatedAt) return latest;
    if (!latest || a.updatedAt > latest) return a.updatedAt;
    return latest;
  }, null);

  // Overall score across all categories (simple average of category scores)
  const overallScore = Math.round(
    KPI_CATEGORIES.reduce((sum, cat) => sum + calcCategoryScore(cat.metrics, actualsMap), 0) /
      KPI_CATEGORIES.length
  );

  const overallColor =
    overallScore >= 90 ? "bg-green-500" : overallScore >= 60 ? "bg-blue-500" : overallScore >= 30 ? "bg-amber-400" : "bg-slate-400";

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KPI Scorecard</h1>
          <p className="text-sm text-slate-500">
            Track progress toward your annual goals
            {lastUpdated && (
              <span className="ml-2 text-slate-400">
                · Last updated {new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {/* Overall score pill */}
          <div className={`flex items-center gap-2 rounded-full ${overallColor} px-4 py-2 text-sm font-bold text-white shadow-sm`}>
            <span>Overall</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5">{overallScore}%</span>
          </div>
        </div>
      </div>

      {/* Category cards */}
      {KPI_CATEGORIES.map((cat) => (
        <CategoryCard
          key={cat.key}
          category={cat}
          actualsMap={actualsMap}
          period={period}
        />
      ))}

      <p className="text-center text-xs text-slate-400">
        Click any Target or Actual value to edit. Progress is auto-calculated. Changes are saved automatically.
      </p>
    </div>
  );
}
