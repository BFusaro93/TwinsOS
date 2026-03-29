"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { X, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMeterReadings, useDeleteMeterReading } from "@/lib/hooks/use-meter-readings";
import { formatDate } from "@/lib/utils";
import type { Meter } from "@/types";

interface MeterDetailSheetProps {
  meter: Meter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SourceBadge({ source }: { source: "samsara" | "manual" }) {
  return source === "samsara" ? (
    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
      Samsara
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
      Manual
    </Badge>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1 text-sm font-semibold text-slate-700">{label}</p>
      <p className="text-sm font-medium text-brand-600">
        {payload[0].name} : {Number(payload[0].value).toLocaleString()} {unit}
      </p>
    </div>
  );
}

function MeterContent({ meter }: { meter: Meter }) {
  const { data: readings, isLoading } = useMeterReadings(meter.id);
  const [deletingReadingId, setDeletingReadingId] = useState<string | null>(null);
  const { mutate: deleteReading, isPending: deletingReading } = useDeleteMeterReading();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // Readings are sorted oldest → newest from the hook
  const chronological = readings ?? [];
  const sorted = [...chronological].reverse(); // newest first for the table

  const chartData = chronological.map((r) => ({
    label: new Date(r.readingAt).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    value: r.value,
  }));

  return (
    <>
      {/* Current reading card */}
      <div className="p-6">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Current Reading
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">
              {meter.currentValue.toLocaleString()}
            </span>
            <span className="text-sm text-slate-500">{meter.unit}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Last updated {formatDate(meter.lastReadingAt)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Chart */}
      {chartData.length > 1 && (
        <>
          <div className="px-6 pt-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reading History (12 Months)
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v.toLocaleString()}
                  width={55}
                />
                <Tooltip content={<ChartTooltip unit={meter.unit} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={meter.name}
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#22c55e" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Separator className="mt-6" />
        </>
      )}

      {/* Reading history table */}
      <div className="p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          All Readings
        </p>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No readings recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Date</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Reading</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Source</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Recorded By</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="group border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-600">{formatDate(r.readingAt)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900">
                      {r.value.toLocaleString()}
                      <span className="ml-1 text-xs font-normal text-slate-400">{meter.unit}</span>
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadge source={r.source} />
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.recordedByName ?? "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDeletingReadingId(r.id)}
                        className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        title="Delete reading"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingReadingId} onOpenChange={(open: boolean) => { if (!open) setDeletingReadingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reading</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this meter reading? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deletingReading}
              onClick={() => {
                if (!deletingReadingId) return;
                deleteReading(
                  { id: deletingReadingId, meterId: meter.id },
                  { onSuccess: () => setDeletingReadingId(null) }
                );
              }}
            >
              {deletingReading ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MeterDetailSheet({ meter, open, onOpenChange }: MeterDetailSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  // Prevent react-remove-scroll (used by the outer Radix Sheet) from blocking
  // wheel/touch events inside this portal. React's synthetic onWheel doesn't
  // reliably reach the native event system for portals rendered to document.body,
  // so we attach native DOM listeners that stopPropagation before the
  // document-level react-remove-scroll handler fires.
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const stopProp = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", stopProp);
    el.addEventListener("touchmove", stopProp);
    return () => {
      el.removeEventListener("wheel", stopProp);
      el.removeEventListener("touchmove", stopProp);
    };
  }, [open]);

  if (!meter || !open) return null;

  // Render via portal so this sits above the primary sheet in the stacking
  // context without being nested inside the Radix Dialog tree — this avoids
  // react-remove-scroll's event interception blocking scroll inside this panel.
  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={meter.name}
      className="pointer-events-auto fixed inset-y-0 right-0 z-[200] flex w-full flex-col overflow-hidden border-l bg-background shadow-xl md:w-[580px]"
    >
      {/* Header */}
      <div className="relative shrink-0 border-b px-6 py-4 pr-14">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">{meter.name}</h2>
          <SourceBadge source={meter.source} />
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{meter.assetName}</p>

        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body — plain div, no Radix scroll lock interference */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MeterContent meter={meter} />
      </div>
    </div>,
    document.body
  );
}
