"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeletonCard, ReportStatCard } from "@/components/shared/ReportStatCard";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { usePMOutcomes } from "@/lib/hooks/use-asset-metrics";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { useCMMSStore } from "@/stores";
import { shiftYmd } from "@/lib/time/zone";
import { formatDate } from "@/lib/utils";
import { countPMOutcomes, summarizePMCompliance, type PMComplianceSummary } from "@/lib/utils/pm-compliance";
import type { PMOutcomeRow } from "@/types/cmms";

const WINDOWS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "6 months" },
  { value: 365, label: "12 months" },
];

function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

function pctClass(v: number | null): string {
  if (v === null) return "text-slate-900";
  if (v >= 95) return "text-green-700";
  if (v >= 80) return "text-amber-600";
  return "text-red-600";
}

function barColor(v: number): string {
  if (v >= 95) return "#16a34a";
  if (v >= 80) return "#d97706";
  return "#dc2626";
}

export function PMComplianceReport() {
  const router = useRouter();
  const { setSelectedWorkOrderId } = useCMMSStore();
  const { today } = useOrgDates();
  const [windowDays, setWindowDays] = useState(90);
  const todayStr = today();
  const fromDate = shiftYmd(todayStr, -windowDays);
  const { data: rows = [], isLoading, isError } = usePMOutcomes(fromDate);

  // Due dates can be in the future (a batch generated early); those aren't
  // part of "the last N days" yet.
  const inWindow = useMemo(() => rows.filter((r) => r.dueOn <= todayStr), [rows, todayStr]);
  const overall = useMemo(() => summarizePMCompliance(countPMOutcomes(inWindow)), [inWindow]);
  const pending = inWindow.filter((r) => r.outcome === "pending").length;

  const bySchedule = useMemo(() => {
    const groups = new Map<string, { title: string; source: PMOutcomeRow["source"]; rows: PMOutcomeRow[] }>();
    for (const r of inWindow) {
      const g = groups.get(r.programId) ?? {
        title: r.programName ?? (r.source === "meter" ? "Deleted meter rule" : "Deleted schedule"),
        source: r.source,
        rows: [],
      };
      g.rows.push(r);
      groups.set(r.programId, g);
    }
    return [...groups.entries()]
      .map(([id, g]) => ({ id, title: g.title, source: g.source, summary: summarizePMCompliance(countPMOutcomes(g.rows)) }))
      .filter((g) => g.summary.due > 0)
      .sort((a, b) => (a.summary.compliancePct ?? 101) - (b.summary.compliancePct ?? 101) || a.title.localeCompare(b.title));
  }, [inWindow]);

  const byMonth = useMemo(() => {
    const groups = new Map<string, PMOutcomeRow[]>();
    for (const r of inWindow) {
      const key = r.dueOn.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, list]) => {
        const s = summarizePMCompliance(countPMOutcomes(list));
        const [y, m] = month.split("-").map(Number);
        return {
          label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          compliance: s.compliancePct,
          due: s.due,
          done: s.done,
        };
      })
      .filter((m) => m.compliance !== null) as { label: string; compliance: number; due: number; done: number }[];
  }, [inWindow]);

  const missed = useMemo(
    () => inWindow.filter((r) => r.outcome === "skipped" || r.outcome === "overdue" || r.outcome === "not_generated"),
    [inWindow]
  );

  function openWorkOrder(id: string) {
    setSelectedWorkOrderId(id);
    router.push("/cmms/work-orders");
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        PMs completed ÷ PMs that came due, scored against each schedule&apos;s calendar. Meter-triggered PMs are due 7 days after the meter trips.
        Skipped, overdue and never-generated PMs count as missed; PMs not yet due aren&apos;t counted.
      </p>
      <SegmentedControl ariaLabel="Compliance window" size="sm" options={WINDOWS} value={windowDays} onChange={setWindowDays} />
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <ReportSkeletonCard key={i} />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-slate-100" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-400">PM compliance couldn&apos;t be loaded.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ReportStatCard
          label="PM Compliance"
          value={pct(overall.compliancePct)}
          valueClassName={pctClass(overall.compliancePct)}
          sub={overall.due > 0 ? `${overall.done} of ${overall.due} completed` : "No PMs came due"}
        />
        <ReportStatCard
          label="On-Time Rate"
          value={pct(overall.onTimePct)}
          valueClassName={pctClass(overall.onTimePct)}
          sub={
            overall.onTimePct === null
              ? "No PMs completed yet"
              : `${overall.onTime} of ${overall.onTime + overall.late} by the due date`
          }
        />
        <ReportStatCard
          label="Missed"
          value={overall.due - overall.done}
          valueClassName={overall.due - overall.done > 0 ? "text-red-600" : "text-slate-900"}
          sub={`${overall.notGenerated} not generated · ${overall.skipped} skipped · ${overall.overdue} overdue`}
        />
        <ReportStatCard label="Open, Not Yet Due" value={pending} sub="Not counted yet" />
      </div>

      {byMonth.length > 1 && (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Compliance by Month</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(value: number, _name, item) => [`${value}% (${item.payload.done} of ${item.payload.due})`, "Compliance"]}
              />
              <Bar dataKey="compliance" radius={[4, 4, 0, 0]}>
                {byMonth.map((m) => <Cell key={m.label} fill={barColor(m.compliance)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm">
        <p className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">By PM Schedule &amp; Meter Rule</p>
        {bySchedule.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">No scheduled PMs came due in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule / Meter Rule</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">Missed</TableHead>
                  <TableHead className="text-right">Compliance</TableHead>
                  <TableHead className="text-right">On Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySchedule.map(({ id, title, source, summary }) => (
                  <ScheduleRow key={id} title={title} source={source} s={summary} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {missed.length > 0 && (
        <div className="rounded-lg border bg-white shadow-sm">
          <p className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Missed PMs <span className="ml-1 font-normal normal-case text-slate-300">({missed.length})</span>
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Schedule / Meter Rule</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missed.map((r) => (
                  <TableRow
                    key={r.workOrderId ?? `${r.programId}-${r.assetId}-${r.dueOn}`}
                    className={r.workOrderId ? "cursor-pointer" : undefined}
                    onClick={r.workOrderId ? () => openWorkOrder(r.workOrderId as string) : undefined}
                  >
                    <TableCell className="font-mono text-xs">{r.workOrderNumber ?? <span className="font-sans text-slate-400">None</span>}</TableCell>
                    <TableCell>{r.programName ?? "—"}</TableCell>
                    <TableCell>{r.assetName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.dueOn)}</TableCell>
                    <TableCell>
                      <span className={r.outcome === "skipped" ? "text-slate-500" : "text-red-600"}>
                        {r.outcome === "overdue" ? "Overdue" : r.outcome === "skipped" ? "Skipped" : "Not generated"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ title, source, s }: { title: string; source: PMOutcomeRow["source"]; s: PMComplianceSummary }) {
  return (
    <TableRow>
      <TableCell className="font-medium text-slate-900">
        {title}
        {source === "meter" && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">Meter</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{s.due}</TableCell>
      <TableCell className="text-right tabular-nums">{s.done}</TableCell>
      <TableCell className="text-right tabular-nums">{s.due - s.done}</TableCell>
      <TableCell className={`text-right font-medium tabular-nums ${pctClass(s.compliancePct)}`}>{pct(s.compliancePct)}</TableCell>
      <TableCell className="text-right tabular-nums text-slate-600">{pct(s.onTimePct)}</TableCell>
    </TableRow>
  );
}
