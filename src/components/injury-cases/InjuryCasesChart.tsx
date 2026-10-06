"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInjuryCases } from "@/lib/hooks/use-injury-cases";
import { formatCurrency } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLORS = { injury: "#ef4444", illness: "#a855f7", near_miss: "#0ea5e9", cost: "#f97316" };

type ViewMode = "incidents" | "cost";

/** YYYY-MM-DD → [year, monthIndex] without a UTC shift. */
function ym(s: string): [number, number] {
  const [y, m] = s.split("-").map(Number);
  return [y, m - 1];
}

export function InjuryCasesChart() {
  const { data: cases = [] } = useInjuryCases();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [mode, setMode] = useState<ViewMode>("incidents");

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    cases.forEach((c) => set.add(ym(c.dateOfIncident)[0]));
    return [...set].sort((a, b) => b - a);
  }, [cases, currentYear]);

  const inYear = useMemo(() => cases.filter((c) => ym(c.dateOfIncident)[0] === year), [cases, year]);

  const chartData = useMemo(
    () =>
      MONTHS.map((month, idx) => {
        const m = inYear.filter((c) => ym(c.dateOfIncident)[1] === idx);
        return {
          month,
          injury: m.filter((c) => c.incidentType === "injury").length,
          illness: m.filter((c) => c.incidentType === "illness").length,
          near_miss: m.filter((c) => c.incidentType === "near_miss").length,
          cost: m.reduce((s, c) => s + c.totalCost, 0) / 100,
        };
      }),
    [inYear],
  );

  const injuries = inYear.filter((c) => c.incidentType === "injury");
  const illnesses = inYear.filter((c) => c.incidentType === "illness");
  const nearMisses = inYear.filter((c) => c.incidentType === "near_miss");
  const totalCost = inYear.reduce((s, c) => s + c.totalCost, 0);
  const selfPayCost = inYear.filter((c) => c.claimRoute === "self_pay").reduce((s, c) => s + c.totalCost, 0);
  const daysAway = inYear.reduce((s, c) => s + c.daysAway, 0);
  const recordable = inYear.filter((c) => c.recordable).length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="space-y-1 rounded-lg border bg-card p-3 text-sm shadow-lg">
        <p className="font-semibold">{label}</p>
        {payload.map((entry: { name: string; value: number }) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span className="text-muted-foreground">{entry.name.replace("_", " ")}:</span>
            <span className="font-medium">{mode === "cost" ? formatCurrency(entry.value * 100) : entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Safety summary</h3>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border bg-red-50 dark:bg-red-950/40 p-4">
          <p className="text-xs uppercase tracking-wide text-red-600 dark:text-red-400">Injuries</p>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">{injuries.length}</p>
          <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">{recordable} recordable · {daysAway} days away</p>
        </div>
        <div className="rounded-lg border bg-purple-50 dark:bg-purple-950/40 p-4">
          <p className="text-xs uppercase tracking-wide text-purple-600 dark:text-purple-400">Illnesses</p>
          <p className="mt-1 text-2xl font-bold text-purple-700 dark:text-purple-400">{illnesses.length}</p>
        </div>
        <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/40 p-4">
          <p className="text-xs uppercase tracking-wide text-sky-600 dark:text-sky-400">Near misses</p>
          <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">{nearMisses.length}</p>
          <p className="mt-0.5 text-xs text-sky-500 dark:text-sky-400">Reporting these is a good sign</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Company-paid cost</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalCost)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(selfPayCost)} on self-pay cases</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">By month — {year}</h3>
          <div className="flex gap-1">
            {(["incidents", "cost"] as ViewMode[]).map((v) => (
              <Button key={v} size="sm" variant={mode === v ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setMode(v)}>
                {v}
              </Button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickFormatter={mode === "cost" ? (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` : undefined}
            />
            <Tooltip content={<CustomTooltip />} />
            {mode === "incidents" ? (
              <>
                <Bar dataKey="injury" name="injury" stackId="a" fill={COLORS.injury} maxBarSize={32} />
                <Bar dataKey="illness" name="illness" stackId="a" fill={COLORS.illness} maxBarSize={32} />
                <Bar dataKey="near_miss" name="near miss" stackId="a" fill={COLORS.near_miss} radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
              </>
            ) : (
              <Bar dataKey="cost" name="cost" fill={COLORS.cost} radius={[3, 3, 0, 0]} maxBarSize={32} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
