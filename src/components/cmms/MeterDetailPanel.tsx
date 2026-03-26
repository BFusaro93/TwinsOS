"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import { EditButton } from "@/components/shared/EditButton";
import { NewMeterDialog } from "@/components/cmms/NewMeterDialog";
import { AddReadingDialog } from "@/components/cmms/AddReadingDialog";
import { useMeterReadings } from "@/lib/hooks/use-meter-readings";
import type { Meter } from "@/types";

interface MeterDetailPanelProps {
  meter: Meter;
}

function formatReadingDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

export function MeterDetailPanel({ meter }: MeterDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [addReadingOpen, setAddReadingOpen] = useState(false);
  const { data: readings, isLoading } = useMeterReadings(meter.id);

  const chartData = (readings ?? []).map((r) => ({
    date: formatReadingDate(r.readingAt),
    value: r.value,
    fullDate: r.readingAt,
  }));

  // Calculate delta from first to last reading
  const firstReading = readings?.[0];
  const lastReading = readings?.[readings.length - 1];
  const totalDelta =
    firstReading && lastReading ? lastReading.value - firstReading.value : null;
  const avgPerMonth =
    totalDelta !== null && readings && readings.length > 1
      ? Math.round(totalDelta / (readings.length - 1))
      : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{meter.assetName}</h2>
          <p className="text-sm text-slate-500">{meter.name}</p>
        </div>
        <Badge
          variant="outline"
          className={
            meter.source === "samsara"
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-slate-200 bg-slate-100 text-slate-500"
          }
        >
          {meter.source === "samsara" ? "Samsara" : "Manual"}
        </Badge>
        <div className="flex items-center gap-2">
          {meter.source === "manual" && (
            <Button size="sm" variant="outline" onClick={() => setAddReadingOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Reading
            </Button>
          )}
          <EditButton onClick={() => setEditOpen(true)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3 p-6">
          <div className="rounded-md border bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Current
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {meter.currentValue.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-slate-400">{meter.unit}</span>
            </p>
          </div>
          {totalDelta !== null && (
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Past 12 mo
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                +{totalDelta.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-slate-400">{meter.unit}</span>
              </p>
            </div>
          )}
          {avgPerMonth !== null && (
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Avg / mo
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {avgPerMonth.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-slate-400">{meter.unit}</span>
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Chart */}
        <div className="p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reading History (12 months)
          </p>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-slate-400">Loading chart…</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v.toLocaleString()}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) =>
                    [`${value.toLocaleString()} ${meter.unit}`, meter.name]
                  }
                  labelStyle={{ color: "#475569", fontSize: 12 }}
                  contentStyle={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <Separator />

        {/* Recent readings table */}
        <div className="p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Recent Readings
          </p>
          <dl>
            <MetaRow label="Last Reading" value={formatDate(meter.lastReadingAt)} />
            <MetaRow label="Source" value={meter.source === "samsara" ? "Samsara (automatic)" : "Manual entry"} />
            <MetaRow label="Asset / Vehicle" value={meter.assetName} />
          </dl>

          {readings && readings.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Date</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Reading</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {[...readings].reverse().slice(0, 6).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{formatDate(r.readingAt)}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">
                        {r.value.toLocaleString()}{" "}
                        <span className="font-normal text-slate-400">{meter.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400 capitalize">{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <NewMeterDialog open={editOpen} onOpenChange={setEditOpen} initialData={meter} />
      <AddReadingDialog open={addReadingOpen} onOpenChange={setAddReadingOpen} meter={meter} />
    </div>
  );
}
