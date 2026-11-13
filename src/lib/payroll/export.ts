import { format, parseISO } from "date-fns";
import type { PayrollRow } from "@/lib/payroll/compute";

/** A day with more than this much time off the clock gets flagged so a long gap can't pass quietly. */
export const LONG_BREAK_MINUTES = 120;

export const isLongBreak = (d: Pick<PayrollRow, "breakMinutes">) => d.breakMinutes > LONG_BREAK_MINUTES;

export interface PayrollMemberTotals {
  crewMemberId: string;
  memberName: string;
  crewName: string | null;
  days: PayrollRow[];
  shiftHours: number;
  jobHours: number;
  extra: number;
  total: number;
  /** total split by the org's overtime rule. */
  regular: number;
  overtime: number;
  openPunches: number;
  openShifts: number;
  adjustedDays: number;
  noShiftDays: number;
  longBreakDays: number;
}

export function groupPayrollByMember(rows: PayrollRow[]): PayrollMemberTotals[] {
  const map = new Map<string, PayrollMemberTotals>();
  for (const r of rows) {
    const m = map.get(r.crewMemberId) ?? {
      crewMemberId: r.crewMemberId, memberName: r.memberName, crewName: r.crewName,
      days: [], shiftHours: 0, jobHours: 0, extra: 0, total: 0, regular: 0, overtime: 0,
      openPunches: 0, openShifts: 0, adjustedDays: 0, noShiftDays: 0, longBreakDays: 0,
    };
    m.days.push(r);
    m.shiftHours += r.baseHours;
    m.jobHours += r.jobHours;
    m.extra += r.extraHours;
    m.total += r.totalHours;
    m.regular += r.regularHours;
    m.overtime += r.overtimeHours;
    m.openPunches += r.openPunches;
    if (r.openShift) m.openShifts += 1;
    if (r.adjusted) m.adjustedDays += 1;
    if (r.noShift) m.noShiftDays += 1;
    if (isLongBreak(r)) m.longBreakDays += 1;
    map.set(r.crewMemberId, m);
  }
  return [...map.values()];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function clock(iso: string | null, tz: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

/** "Lunch 30 min · breaks 12 min · job pauses 8 min": the job-punch time off, in minutes (no clock times are stored). */
export function offClockBreakdown(d: Pick<PayrollRow, "lunchMinutes" | "jobBreakMinutes" | "jobPauseMinutes">): string[] {
  const parts: string[] = [];
  if (d.lunchMinutes > 0) parts.push(`Lunch ${d.lunchMinutes} min`);
  if (d.jobBreakMinutes > 0) parts.push(`breaks ${d.jobBreakMinutes} min`);
  if (d.jobPauseMinutes > 0) parts.push(`job pauses ${d.jobPauseMinutes} min`);
  return parts;
}

/** "7:04 AM – 12:04 PM (300 min)" for each stretch marked out of the day, then the lunch/break/pause minutes. */
export function breakDetail(d: Pick<PayrollRow, "breakGaps" | "lunchMinutes" | "jobBreakMinutes" | "jobPauseMinutes">, tz: string): string {
  return [
    ...d.breakGaps.map((g) => `${clock(g.from, tz)} – ${clock(g.to, tz)} (${g.minutes} min)`),
    ...offClockBreakdown(d),
  ].join("; ");
}

export const DAILY_HEADERS = [
  "Employee", "Crew", "Date", "Clock In", "Clock Out", "Break (min)", "Break Times", "Day Hours", "Job Hours", "Extra Hours", "Total Hours",
  "Regular Hours", "OT Hours", "Status", "Note",
];

/** Flags a day that needs a look before it is paid. */
export function dayStatus(d: PayrollRow): string {
  const flags: string[] = [];
  if (d.openShift) flags.push("OPEN SHIFT");
  if (d.noShift) flags.push("NO SHIFT");
  if (d.openPunches > 0) flags.push("OPEN PUNCH");
  if (isLongBreak(d)) flags.push("LONG BREAK");
  if (d.adjusted) flags.push("ADJUSTED");
  return flags.join(", ");
}

/** One row per person per day — numbers stay numbers so Excel and payroll uploads can sum them. */
export function dailyRows(members: PayrollMemberTotals[], tz: string): (string | number)[][] {
  return members.flatMap((m) =>
    m.days.map((d) => [
      m.memberName, d.crewName ?? "", d.workDate, clock(d.shiftStart, tz), clock(d.shiftEnd, tz), d.breakMinutes, breakDetail(d, tz),
      r2(d.baseHours), r2(d.jobHours), r2(d.extraHours), r2(d.totalHours), r2(d.regularHours), r2(d.overtimeHours), dayStatus(d), d.note ?? "",
    ])
  );
}

/** Printed with the totals so "Days to Review" is self-explanatory on a PDF. */
export const DAYS_TO_REVIEW_NOTE =
  "Days to Review = days with a shift that was never ended (open) or job time but no Start Day (no shift). Hours on those days may be understated or missing.";

export const SUMMARY_HEADERS = ["Employee", "Crew", "Days Worked", "Days to Review", "Day Hours", "Extra Hours", "Total Hours", "Regular Hours", "OT Hours"];

export function summaryRows(members: PayrollMemberTotals[]): (string | number)[][] {
  return members.map((m) => [
    m.memberName, m.crewName ?? "", m.days.filter((d) => d.totalHours > 0).length,
    m.openShifts + m.noShiftDays,
    r2(m.shiftHours), r2(m.extra), r2(m.total), r2(m.regular), r2(m.overtime),
  ]);
}

export function periodLabel(from: string, to: string): string {
  return `${format(parseISO(from), "MMM d, yyyy")} – ${format(parseISO(to), "MMM d, yyyy")}`;
}
