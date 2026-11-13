"use client";

import { Fragment, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Lock, RotateCcw, Wallet } from "lucide-react";
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
import { instantToZoneWallClock, mondayOfYmd, shiftYmd, todayInZone } from "@/lib/time/zone";
import {
  PayrollForbiddenError,
  usePayroll,
  usePayrollLock,
  useSavePayrollAdjustment,
  useSetPayrollLock,
  type PayrollRow,
} from "@/lib/hooks/use-payroll";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { isPayrollDayLocked } from "@/lib/crew/payroll-lock";
import {
  DAILY_HEADERS, DAYS_TO_REVIEW_NOTE, LONG_BREAK_MINUTES, SUMMARY_HEADERS, dailyRows, groupPayrollByMember, isLongBreak, offClockBreakdown, periodLabel, summaryRows,
} from "@/lib/payroll/export";
import { describeOvertimeRule } from "@/lib/payroll/overtime";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx-export";
import { exportReportPDF } from "@/lib/reports/export-pdf";

const fmt = (n: number) => n.toFixed(2);
const fmtDuration = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);

// Presets run on the ORG's calendar (its today, Monday-start weeks), not the
// viewer's laptop: an office in another zone, or a late-Sunday export, picked
// the wrong week. There is no per-org pay-week setting yet, so weeks start Monday.
function thisWeek(tz: string): { from: string; to: string } {
  const start = mondayOfYmd(todayInZone(tz));
  return { from: start, to: shiftYmd(start, 6) };
}
function lastWeek(tz: string): { from: string; to: string } {
  const start = shiftYmd(mondayOfYmd(todayInZone(tz)), -7);
  return { from: start, to: shiftYmd(start, 6) };
}
function lastTwoWeeks(tz: string): { from: string; to: string } {
  const start = shiftYmd(mondayOfYmd(todayInZone(tz)), -14);
  return { from: start, to: shiftYmd(start, 13) };
}

export function PayrollReport() {
  const tz = useOrgTimeZone();
  // Initial range only; it may be computed before the org's zone loads (the
  // default zone), which at worst differs by a day around midnight Monday.
  const initial = useMemo(() => lastWeek(tz), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data: report, isLoading, error } = usePayroll(from, to);
  const rows = useMemo(() => report?.rows ?? [], [report]);
  const overtimeLabel = report ? describeOvertimeRule(report.overtime) : null;
  const members = useMemo(() => groupPayrollByMember(rows), [rows]);
  const { data: lockedThrough = null } = usePayrollLock();

  const setRange = (r: { from: string; to: string }) => { setFrom(r.from); setTo(r.to); };
  const toggle = (id: string) =>
    setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fileBase = `payroll-${from}-to-${to}`;
  const flagged = members.reduce((s, m) => s + m.openShifts + m.openPunches + m.noShiftDays + m.longBreakDays, 0);

  // Open and no-shift days are understated or missing — make the exporter acknowledge that.
  const unpaidFlags = members.reduce((s, m) => s + m.openShifts + m.noShiftDays, 0);
  function confirmFlagged(): boolean {
    return unpaidFlags === 0 || window.confirm(
      `${unpaidFlags} day${unpaidFlags === 1 ? " is" : "s are"} open or have no shift, so hours are understated or missing. Export anyway?`
    );
  }

  function exportCsv(kind: "daily" | "summary") {
    if (!confirmFlagged()) return;
    if (kind === "daily") downloadCSV(`${fileBase}-daily.csv`, DAILY_HEADERS, dailyRows(members, tz));
    else downloadCSV(`${fileBase}-totals.csv`, SUMMARY_HEADERS, summaryRows(members));
  }
  function exportExcel() {
    if (!confirmFlagged()) return;
    downloadXLSX(`${fileBase}.xlsx`, [
      { name: "Totals", headers: SUMMARY_HEADERS, rows: summaryRows(members) },
      { name: "Daily", headers: DAILY_HEADERS, rows: dailyRows(members, tz) },
    ]);
  }
  async function exportPdf() {
    if (!confirmFlagged()) return;
    const text = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (typeof c === "number" ? fmt(c) : c)));
    try {
      await exportReportPDF(`Payroll ${periodLabel(from, to)}`, [
        {
          heading: `Totals by employee — ${DAYS_TO_REVIEW_NOTE}${overtimeLabel ? ` ${overtimeLabel}.` : ""}`,
          columns: SUMMARY_HEADERS,
          rows: text(summaryRows(members)),
        },
        // One table per employee (with its own total) instead of one long run of everyone's days.
        ...members.map((m) => {
          const dayRows = dailyRows([m], tz).map((r) => r.slice(2));
          return {
            heading: `${m.memberName}${m.crewName ? ` — ${m.crewName}` : ""}`,
            columns: DAILY_HEADERS.slice(2),
            rows: text(dayRows),
            totals: ["Total", "", "", "", "", fmt(m.shiftHours), fmt(m.jobHours), fmt(m.extra), fmt(m.pto), fmt(m.total), fmt(m.regular), fmt(m.overtime), "", ""],
          };
        }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  }

  if (error instanceof PayrollForbiddenError) {
    return <EmptyState icon={Wallet} title="No access to Payroll" description="Payroll needs the View & Edit Payroll Report permission. Ask an admin if you need access." />;
  }

  const grand = members.reduce((s, m) => s + m.total, 0);
  const grandOvertime = members.reduce((s, m) => s + m.overtime, 0);

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
        <Button variant="outline" size="sm" onClick={() => setRange(thisWeek(tz))}>This week</Button>
        <Button variant="outline" size="sm" onClick={() => setRange(lastWeek(tz))}>Last week</Button>
        <Button variant="outline" size="sm" onClick={() => setRange(lastTwoWeeks(tz))}>Last 2 weeks</Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Total <strong className="text-foreground">{fmt(grand)} h</strong>
            {grandOvertime > 0 && <> · OT <strong className="text-foreground">{fmt(grandOvertime)} h</strong></>}
          </span>
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

      <PayrollLockBar lockedThrough={lockedThrough} tz={tz} />

      <p className="text-xs text-muted-foreground">
        Paid time is each person&apos;s day — clocked in at the shop to clocked out at the shop — less lunch and unpaid pauses.
        Edit any day to change its hours or add shop time/PTO. The recorded hours stay visible and job costing is not changed.
        {overtimeLabel && <> {overtimeLabel} (change it in Settings → Organization).</>}
      </p>
      {flagged > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {flagged} day{flagged === 1 ? "" : "s"} need a look: a day was never ended, a job punch is still open, no one started the day, or a break is over {LONG_BREAK_MINUTES / 60} hours. Expand a person to see which.
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
                <TableHead className="text-right" title="Extra worked time (shop, travel). Counts toward overtime.">Extra</TableHead>
                <TableHead className="text-right" title="Paid time off. Paid as regular hours, never overtime.">PTO</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Regular</TableHead>
                <TableHead className="text-right">OT</TableHead>
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
                      <TableCell className="text-right tabular-nums">{fmt(m.pto)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(m.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.regular)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${m.overtime > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{fmt(m.overtime)}</TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        {(m.openShifts + m.openPunches + m.noShiftDays + m.longBreakDays) > 0 && (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                            <AlertTriangle className="h-3 w-3" /> check
                          </Badge>
                        )}
                        {m.adjustedDays > 0 && <Badge variant="outline">{m.adjustedDays} adjusted</Badge>}
                      </TableCell>
                    </TableRow>
                    {isOpen && m.days.map((d) => (
                      <DayRow key={d.workDate} row={d} tz={tz} locked={isPayrollDayLocked(d.workDate, lockedThrough)} />
                    ))}
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

/**
 * The payroll lock date: days on or before it can't be changed by anyone (the
 * database refuses shift, punch and adjustment edits). Everyone with Payroll
 * sees it; only an admin can move it, and only to a day before today.
 */
function PayrollLockBar({ lockedThrough, tz }: { lockedThrough: string | null; tz: string }) {
  const { data: profile } = useCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const setLock = useSetPayrollLock();
  const [draft, setDraft] = useState<string>("");
  const yesterday = shiftYmd(todayInZone(tz), -1);
  const value = draft || lockedThrough || "";

  if (!isAdmin && !lockedThrough) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <Lock className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm">
        {lockedThrough
          ? <>Payroll is locked through <strong>{format(parseISO(lockedThrough), "EEE MMM d, yyyy")}</strong> — those days can&apos;t be changed.</>
          : "Payroll isn't locked. Lock a pay period after you've exported and paid it."}
      </span>
      {isAdmin && (
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="date"
            value={value}
            max={yesterday}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Lock payroll through"
            className="h-8 w-40 text-xs"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={setLock.isPending || !value || value === lockedThrough || value > yesterday}
            onClick={() => setLock.mutate(value, { onSuccess: () => setDraft("") })}
          >
            {lockedThrough ? "Move lock" : "Lock"}
          </Button>
          {lockedThrough && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={setLock.isPending}
              onClick={() => {
                if (window.confirm("Unlock payroll? Every past day becomes editable again.")) {
                  setLock.mutate(null, { onSuccess: () => setDraft("") });
                }
              }}
            >
              Unlock
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DayRow({ row, tz, locked }: { row: PayrollRow; tz: string; locked: boolean }) {
  const save = useSavePayrollAdjustment();
  const [hours, setHours] = useState(row.hoursOverride != null ? String(row.hoursOverride) : "");
  const [extra, setExtra] = useState(row.extraHours ? String(row.extraHours) : "");
  const [pto, setPto] = useState(row.ptoHours ? String(row.ptoHours) : "");
  const [note, setNote] = useState(row.note ?? "");
  // The inputs show what is paid for the day: the corrected value when the office set one,
  // else the recorded value. Only a value that differs from the RECORDED one is saved as a
  // correction, so leaving a field alone never creates an override.
  const wall = (iso: string | null) => (iso ? instantToZoneWallClock(new Date(iso), tz).time.slice(0, 5) : "");
  const initStart = wall(row.shiftStart);
  const initEnd = wall(row.shiftEnd);
  const initBreak = String(row.breakMinutes);
  const [startTime, setStartTime] = useState(initStart);
  const [endTime, setEndTime] = useState(initEnd);
  const [breakMins, setBreakMins] = useState(initBreak);

  const parse = (s: string): number | null => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Math.max(0, Number(s)));
  const breakValue = parse(breakMins) != null ? Math.round(parse(breakMins) as number) : null;
  const dirty =
    parse(hours) !== row.hoursOverride || (parse(extra) ?? 0) !== row.extraHours || (parse(pto) ?? 0) !== (row.ptoHours ?? 0) || (note.trim() || null) !== row.note ||
    startTime !== initStart || endTime !== initEnd || breakMins !== initBreak;
  const computed = row.noShift ? row.jobHours : row.shiftHours;
  const clock = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }) : "—";

  function submit(clear = false) {
    save.mutate({
      crewMemberId: row.crewMemberId,
      workDate: row.workDate,
      hoursOverride: clear ? null : parse(hours),
      startTime: clear || !startTime || startTime === wall(row.recordedStart) ? null : startTime,
      endTime: clear || !endTime || endTime === wall(row.recordedEnd) ? null : endTime,
      breakMinutes: clear || breakValue == null || breakValue === row.recordedBreakMinutes ? null : breakValue,
      extraHours: clear ? 0 : parse(extra) ?? 0,
      ptoHours: clear ? 0 : parse(pto) ?? 0,
      note: clear ? null : note.trim() || null,
    });
    if (clear) {
      setHours(""); setExtra(""); setPto(""); setNote("");
      setStartTime(wall(row.recordedStart)); setEndTime(wall(row.recordedEnd)); setBreakMins(String(row.recordedBreakMinutes));
    }
  }

  return (
    <TableRow className="bg-muted/30">
      <TableCell />
      <TableCell className="pl-6 text-sm">
        <div className="flex items-center gap-1.5">
          {format(parseISO(row.workDate), "EEE MMM d")}
          {locked && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]" title="Payroll is locked for this day — an admin can move the lock date">
              <Lock className="h-3 w-3" /> Locked
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.noShift ? "No day punch" : `${clock(row.shiftStart)} – ${row.openShift ? "still open" : clock(row.shiftEnd)}`}
        </div>
        {row.breakGaps.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Out: {row.breakGaps.map((g) => `${clock(g.from)} – ${clock(g.to)} (${g.minutes} min)`).join("; ")}
          </div>
        )}
        {offClockBreakdown(row).length > 0 && (
          <div className="text-xs text-muted-foreground">{offClockBreakdown(row).join(" · ")}</div>
        )}
        {isLongBreak(row) && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" /> {fmtDuration(row.breakMinutes)} off the clock
          </div>
        )}
        {row.autoStart && <div className="text-xs text-amber-600">Started at first job</div>}
        {row.openPunches > 0 && <div className="text-xs text-amber-600">Job punch still open</div>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <Input disabled={locked} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} title={`Clock in (recorded ${clock(row.recordedStart)})`} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input disabled={locked} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} title={`Clock out (recorded ${row.recordedStart && !row.recordedEnd ? "still open" : clock(row.recordedEnd)})`} className="h-8 w-36 text-xs" />
          <Input disabled={locked} value={breakMins} onChange={(e) => setBreakMins(e.target.value)} inputMode="numeric" aria-label="Minutes off the clock" title={`Total unpaid minutes off the clock for the day (recorded ${row.recordedBreakMinutes}). Replaces the recorded breaks, job breaks included`} className="h-8 w-20 text-xs" />
          <span className="text-xs text-muted-foreground">min off</span>
        </div>
        <Input disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (why adjusted)" className="mt-1 h-8 text-xs" />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">{fmt(computed)} →</span>
          <Input disabled={locked} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={fmt(computed)} inputMode="decimal" className="h-8 w-20 text-right" />
        </div>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">{fmt(row.jobHours)}</TableCell>
      <TableCell className="text-right">
        <Input disabled={locked} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0.00" inputMode="decimal" className="h-8 w-20 text-right" aria-label="Extra worked hours" title="Extra worked time (shop, travel). Counts toward overtime." />
      </TableCell>
      <TableCell className="text-right">
        <Input disabled={locked} value={pto} onChange={(e) => setPto(e.target.value)} placeholder="0.00" inputMode="decimal" className="h-8 w-20 text-right" aria-label="PTO hours" title="Paid time off. Paid as regular hours, never overtime." />
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{fmt(row.totalHours)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(row.regularHours)}</TableCell>
      <TableCell className={`text-right tabular-nums ${row.overtimeHours > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{fmt(row.overtimeHours)}</TableCell>
      <TableCell className="space-x-1 whitespace-nowrap">
        <Button size="sm" className="h-8" disabled={locked || !dirty || save.isPending} onClick={() => submit()}>Save</Button>
        {row.adjusted && (
          <Button size="sm" variant="ghost" className="h-8 px-2" title="Reset to recorded hours" disabled={locked || save.isPending} onClick={() => submit(true)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
