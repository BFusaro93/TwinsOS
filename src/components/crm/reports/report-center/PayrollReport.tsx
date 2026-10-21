"use client";

import { Fragment, useMemo, useState } from "react";
import { addDays, endOfWeek, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronRight, Download, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { instantToZoneWallClock } from "@/lib/time/zone";
import {
  PayrollForbiddenError,
  usePayroll,
  useSavePayrollAdjustment,
  type PayrollRow,
} from "@/lib/hooks/use-payroll";
import {
  DAILY_HEADERS, SUMMARY_HEADERS, dailyRows, groupPayrollByMember, periodLabel, summaryRows,
} from "@/lib/payroll/export";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx-export";
import { exportReportPDF } from "@/lib/reports/export-pdf";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const fmt = (n: number) => n.toFixed(2);

function lastWeek(): { from: string; to: string } {
  const start = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
  return { from: ymd(start), to: ymd(endOfWeek(start, { weekStartsOn: 1 })) };
}
function thisWeek(): { from: string; to: string } {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  return { from: ymd(start), to: ymd(addDays(start, 6)) };
}
function lastTwoWeeks(): { from: string; to: string } {
  const start = startOfWeek(subWeeks(new Date(), 2), { weekStartsOn: 1 });
  return { from: ymd(start), to: ymd(endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 })) };
}

export function PayrollReport() {
  const initial = useMemo(lastWeek, []);
  const tz = useOrgTimeZone();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data: rows = [], isLoading, error } = usePayroll(from, to);
  const members = useMemo(() => groupPayrollByMember(rows), [rows]);

  const setRange = (r: { from: string; to: string }) => { setFrom(r.from); setTo(r.to); };
  const toggle = (id: string) =>
    setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fileBase = `payroll-${from}-to-${to}`;
  const flagged = members.reduce((s, m) => s + m.openShifts + m.openPunches + m.noShiftDays, 0);

  function exportCsv(kind: "daily" | "summary") {
    if (kind === "daily") downloadCSV(`${fileBase}-daily.csv`, DAILY_HEADERS, dailyRows(members, tz));
    else downloadCSV(`${fileBase}-totals.csv`, SUMMARY_HEADERS, summaryRows(members));
  }
  function exportExcel() {
    downloadXLSX(`${fileBase}.xlsx`, [
      { name: "Totals", headers: SUMMARY_HEADERS, rows: summaryRows(members) },
      { name: "Daily", headers: DAILY_HEADERS, rows: dailyRows(members, tz) },
    ]);
  }
  async function exportPdf() {
    const text = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (typeof c === "number" ? fmt(c) : c)));
    try {
      await exportReportPDF(`Payroll ${periodLabel(from, to)}`, [
        { heading: "Totals by employee", columns: SUMMARY_HEADERS, rows: text(summaryRows(members)) },
        { heading: "Daily detail", columns: DAILY_HEADERS, rows: text(dailyRows(members, tz)) },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  }

  if (error instanceof PayrollForbiddenError) {
    return <EmptyState icon={Wallet} title="Payroll is limited to admins and managers" description="Ask an admin if you need access." />;
  }

  const grand = members.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setRange(thisWeek())}>This week</Button>
        <Button variant="outline" size="sm" onClick={() => setRange(lastWeek())}>Last week</Button>
        <Button variant="outline" size="sm" onClick={() => setRange(lastTwoWeeks())}>Last 2 weeks</Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Total <strong className="text-foreground">{fmt(grand)} h</strong></span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" disabled={rows.length === 0}>
                <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportExcel}>Excel (.xlsx) — totals + daily</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("summary")}>CSV — totals by employee</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("daily")}>CSV — daily detail</DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Paid time is each person&apos;s day — clocked in at the shop to clocked out at the shop — less lunch and unpaid pauses.
        Edit any day to change its hours or add shop time/PTO. The recorded hours stay visible and job costing is not changed.
      </p>
      {flagged > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {flagged} day{flagged === 1 ? "" : "s"} need a look: a day was never ended, a job punch is still open, or no one started the day. Expand a person to see which.
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : members.length === 0 ? (
        <EmptyState icon={Wallet} title="No time recorded" description="No shifts, punches or adjustments in this period." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Employee</TableHead>
                <TableHead>Crew</TableHead>
                <TableHead className="text-right">Day hours</TableHead>
                <TableHead className="text-right">On jobs</TableHead>
                <TableHead className="text-right">Extra</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isOpen = open.has(m.crewMemberId);
                return (
                  <Fragment key={m.crewMemberId}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(m.crewMemberId)}>
                      <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-medium">{m.memberName}</TableCell>
                      <TableCell className="text-muted-foreground">{m.crewName ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.shiftHours)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(m.jobHours)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.extra)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(m.total)}</TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        {(m.openShifts + m.openPunches + m.noShiftDays) > 0 && (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                            <AlertTriangle className="h-3 w-3" /> check
                          </Badge>
                        )}
                        {m.adjustedDays > 0 && <Badge variant="outline">{m.adjustedDays} adjusted</Badge>}
                      </TableCell>
                    </TableRow>
                    {isOpen && m.days.map((d) => <DayRow key={d.workDate} row={d} tz={tz} />)}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function DayRow({ row, tz }: { row: PayrollRow; tz: string }) {
  const save = useSavePayrollAdjustment();
  const [hours, setHours] = useState(row.hoursOverride != null ? String(row.hoursOverride) : "");
  const [extra, setExtra] = useState(row.extraHours ? String(row.extraHours) : "");
  const [note, setNote] = useState(row.note ?? "");
  // Time inputs show the corrected time when there is one, else stay blank with
  // the recorded time as the placeholder.
  const wall = (iso: string | null) => (iso ? instantToZoneWallClock(new Date(iso), tz).time.slice(0, 5) : "");
  const [startTime, setStartTime] = useState(wall(row.startOverride));
  const [endTime, setEndTime] = useState(wall(row.endOverride));
  const [breakMins, setBreakMins] = useState(row.breakOverride != null ? String(row.breakOverride) : "");

  const parse = (s: string): number | null => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Math.max(0, Number(s)));
  const dirty =
    parse(hours) !== row.hoursOverride || (parse(extra) ?? 0) !== row.extraHours || (note.trim() || null) !== row.note ||
    (startTime || null) !== (wall(row.startOverride) || null) || (endTime || null) !== (wall(row.endOverride) || null) ||
    (parse(breakMins) != null ? Math.round(parse(breakMins) as number) : null) !== row.breakOverride;
  const computed = row.noShift ? row.jobHours : row.shiftHours;
  const clock = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }) : "—";

  function submit(clear = false) {
    save.mutate({
      crewMemberId: row.crewMemberId,
      workDate: row.workDate,
      hoursOverride: clear ? null : parse(hours),
      startTime: clear ? null : startTime || null,
      endTime: clear ? null : endTime || null,
      breakMinutes: clear || parse(breakMins) == null ? null : Math.round(parse(breakMins) as number),
      extraHours: clear ? 0 : parse(extra) ?? 0,
      note: clear ? null : note.trim() || null,
    });
    if (clear) { setHours(""); setExtra(""); setNote(""); setStartTime(""); setEndTime(""); setBreakMins(""); }
  }

  return (
    <TableRow className="bg-muted/30">
      <TableCell />
      <TableCell className="pl-6 text-sm">
        <div>{format(parseISO(row.workDate), "EEE MMM d")}</div>
        <div className="text-xs text-muted-foreground">
          {row.noShift ? "No day punch" : `${clock(row.shiftStart)} – ${row.openShift ? "still open" : clock(row.shiftEnd)}`}
        </div>
        {row.autoStart && <div className="text-xs text-amber-600">Started at first job</div>}
        {row.openPunches > 0 && <div className="text-xs text-amber-600">Job punch still open</div>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} title={`Clock in (recorded ${clock(row.shiftStart)})`} className="h-8 w-28 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} title={`Clock out (recorded ${row.openShift ? "still open" : clock(row.shiftEnd)})`} className="h-8 w-28 text-xs" />
          <Input value={breakMins} onChange={(e) => setBreakMins(e.target.value)} placeholder={`${row.breakMinutes} min off`} inputMode="numeric" title="Unpaid minutes off the clock" className="h-8 w-24 text-xs" />
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (why adjusted)" className="mt-1 h-8 text-xs" />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">{fmt(computed)} →</span>
          <Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder={fmt(computed)} inputMode="decimal" className="h-8 w-20 text-right" />
        </div>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">{fmt(row.jobHours)}</TableCell>
      <TableCell className="text-right">
        <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0.00" inputMode="decimal" className="h-8 w-20 text-right" />
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{fmt(row.totalHours)}</TableCell>
      <TableCell className="space-x-1 whitespace-nowrap">
        <Button size="sm" className="h-8" disabled={!dirty || save.isPending} onClick={() => submit()}>Save</Button>
        {row.adjusted && (
          <Button size="sm" variant="ghost" className="h-8 px-2" title="Reset to recorded hours" disabled={save.isPending} onClick={() => submit(true)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
