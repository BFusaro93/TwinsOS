"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useDamageCases } from "@/lib/hooks/use-damage-cases";
import { formatCurrency } from "@/lib/utils";
import type { DamageCaseType } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLORS: Record<DamageCaseType, string> = {
  damage: "#ef4444",
  warranty: "#a855f7",
};

type ViewMode = "both" | "damage" | "warranty";

export function DamageCasesChart() {
  const { data: cases = [] } = useDamageCases();
  const [mode, setMode] = useState<ViewMode>("both");
  const currentYear = new Date().getFullYear();

  // Parse YYYY-MM-DD without timezone conversion (new Date("2026-01-01") is UTC
  // midnight which shifts to Dec 31 in US timezones — split the string instead)
  const parseLocalDate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const chartData = useMemo(() => {
    return MONTHS.map((month, idx) => {
      const monthCases = cases.filter((c) => {
        const d = parseLocalDate(c.dateOfIncident);
        return d.getFullYear() === currentYear && d.getMonth() === idx;
      });
      return {
        month,
        damage: monthCases.filter((c) => c.caseType === "damage").reduce((s, c) => s + c.totalCost, 0) / 100,
        warranty: monthCases.filter((c) => c.caseType === "warranty").reduce((s, c) => s + c.totalCost, 0) / 100,
        damageCount: monthCases.filter((c) => c.caseType === "damage").length,
        warrantyCount: monthCases.filter((c) => c.caseType === "warranty").length,
      };
    });
  }, [cases, currentYear]);

  const ytdDamage = cases.filter((c) => c.caseType === "damage" && parseLocalDate(c.dateOfIncident).getFullYear() === currentYear).reduce((s, c) => s + c.totalCost, 0);
  const ytdWarranty = cases.filter((c) => c.caseType === "warranty" && parseLocalDate(c.dateOfIncident).getFullYear() === currentYear).reduce((s, c) => s + c.totalCost, 0);
  const ytdTotal = ytdDamage + ytdWarranty;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border rounded-lg shadow-lg p-3 text-sm space-y-1">
        <p className="font-semibold">{label}</p>
        {payload.map((entry: { name: string; value: number; payload: { damageCount: number; warrantyCount: number } }) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span className="capitalize text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">{formatCurrency(entry.value * 100)}</span>
            <span className="text-xs text-muted-foreground">
              ({entry.name === "damage" ? entry.payload.damageCount : entry.payload.warrantyCount} cases)
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* YTD summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">YTD Total</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(ytdTotal)}</p>
        </div>
        <div className="rounded-lg border bg-red-50 p-4">
          <p className="text-xs text-red-600 uppercase tracking-wide">Damage</p>
          <p className="text-2xl font-bold mt-1 text-red-700">{formatCurrency(ytdDamage)}</p>
          <p className="text-xs text-red-500 mt-0.5">
            {cases.filter((c) => c.caseType === "damage" && parseLocalDate(c.dateOfIncident).getFullYear() === currentYear).length} cases
          </p>
        </div>
        <div className="rounded-lg border bg-purple-50 p-4">
          <p className="text-xs text-purple-600 uppercase tracking-wide">Warranty</p>
          <p className="text-2xl font-bold mt-1 text-purple-700">{formatCurrency(ytdWarranty)}</p>
          <p className="text-xs text-purple-500 mt-0.5">
            {cases.filter((c) => c.caseType === "warranty" && parseLocalDate(c.dateOfIncident).getFullYear() === currentYear).length} cases
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">YTD by Month — {currentYear}</h3>
          <div className="flex gap-1">
            {(["both", "damage", "warranty"] as ViewMode[]).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={mode === v ? "default" : "outline"}
                className="h-7 text-xs capitalize"
                onClick={() => setMode(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<CustomTooltip />} />
            {mode !== "warranty" && (
              <Bar dataKey="damage" name="damage" fill={COLORS.damage} radius={[3, 3, 0, 0]} maxBarSize={32} />
            )}
            {mode !== "damage" && (
              <Bar dataKey="warranty" name="warranty" fill={COLORS.warranty} radius={[3, 3, 0, 0]} maxBarSize={32} />
            )}
            {mode === "both" && <Legend formatter={(v) => <span className="capitalize text-xs">{v}</span>} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
