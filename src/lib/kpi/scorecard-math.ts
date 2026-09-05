import type { KpiUnit } from "@/types/crm-kpi-scorecard";

// ============================================================
// Pure scoring/formatting helpers for the Landscapt KPI Scorecard.
// Mirrors the legacy scorecard's math (KpiDashboard.tsx) so both cards
// grade the same way: progress = actual ÷ target (inverted when lower is
// better), capped at 100; category score = weight-averaged progress over
// metrics that have both a target and an actual.
// ============================================================

export interface ScoredMetric {
  weight: number;
  lowerIsBetter?: boolean;
  target: number | null;
  actual: number | null;
}

export function formatKpiValue(value: number | null | undefined, unit: KpiUnit): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  switch (unit) {
    case "currency": {
      const abs = Math.abs(value);
      const sign = value < 0 ? "-" : "";
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
      return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    case "percent":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "hours":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`;
    case "days":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} days`;
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
}

export function kpiPlaceholder(unit: KpiUnit): string {
  switch (unit) {
    case "currency":
      return "Enter $";
    case "percent":
      return "Enter %";
    case "hours":
      return "Enter hrs";
    case "days":
      return "Enter days";
    default:
      return "Enter #";
  }
}

export function calcProgress(actual: number | null, target: number | null, lowerIsBetter?: boolean): number {
  if (actual === null || target === null) return 0;
  if (lowerIsBetter) {
    // Meeting or beating the target is 100%; degrade proportionally above it.
    if (actual <= target) return 100;
    if (actual <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((target / actual) * 100)));
  }
  if (target === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((actual / target) * 100)));
}

export function calcCategoryScore(metrics: ScoredMetric[]): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of metrics) {
    if (m.actual === null || m.target === null) continue;
    weightedSum += calcProgress(m.actual, m.target, m.lowerIsBetter) * m.weight;
    totalWeight += m.weight;
  }
  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}

export function scoreColorClass(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 30) return "bg-amber-400";
  return "bg-slate-400";
}
