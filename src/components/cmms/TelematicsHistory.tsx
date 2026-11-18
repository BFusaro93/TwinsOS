"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useVehicleTelematicsHistory, type TelematicsHistoryPoint } from "@/lib/hooks/use-vehicle-telematics";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 12,
};

function shortDate(iso: string, days: number): string {
  const d = new Date(iso);
  return days <= 7
    ? d.toLocaleDateString(undefined, { weekday: "short", hour: "numeric" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChartProps {
  title: string;
  points: TelematicsHistoryPoint[];
  days: number;
  pick: (p: TelematicsHistoryPoint) => number | null;
  format: (v: number) => string;
  color: string;
  domain: [number | "auto", number | "auto"];
}

function HistoryChart({ title, points, days, pick, format, color, domain }: ChartProps) {
  const data = points.flatMap((p) => {
    const v = pick(p);
    return v === null ? [] : [{ t: new Date(p.recordedAt).getTime(), value: v }];
  });

  return (
    <div className="min-w-0">
      <p className="mb-2 text-sm font-medium text-slate-700 dark:text-neutral-300">{title}</p>
      {data.length < 2 ? (
        <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed text-sm text-slate-400 dark:text-neutral-500">
          Not enough readings yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(t: number) => shortDate(new Date(t).toISOString(), days)}
              minTickGap={32}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} domain={domain} tickFormatter={(v: number) => format(v)} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(t) => new Date(Number(t)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              formatter={(value) => [format(Number(value)), title]}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Fuel level and battery voltage over time, from the hourly samples. */
export function TelematicsHistory({ vehicleId }: { vehicleId: string }) {
  const [days, setDays] = useState<number>(30);
  const { data: points = [], isLoading } = useVehicleTelematicsHistory(vehicleId, days);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">History</h3>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="History range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                days === r.days
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                  : "text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-100",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="flex h-[180px] items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <HistoryChart
              title="Fuel Level"
              points={points}
              days={days}
              pick={(p) => p.fuelPercent}
              format={(v) => `${Math.round(v)}%`}
              color="#22c55e"
              domain={[0, 100]}
            />
            <HistoryChart
              title="Battery"
              points={points}
              days={days}
              pick={(p) => p.batteryVolts}
              format={(v) => `${v.toFixed(1)} V`}
              color="#3b82f6"
              domain={["auto", "auto"]}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400 dark:text-neutral-500">
          Sampled once an hour. A flat line means the vehicle hasn&apos;t reported a new reading.
        </p>
      </div>
    </div>
  );
}
