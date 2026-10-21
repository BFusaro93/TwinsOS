import { format, parseISO } from "date-fns";
import type { PayrollRow } from "@/lib/payroll/compute";

export interface PayrollMemberTotals {
  crewMemberId: string;
  memberName: string;
  crewName: string | null;
  days: PayrollRow[];
  shiftHours: number;
  jobHours: number;
  extra: number;
  total: number;
  openPunches: number;
  openShifts: number;
  adjustedDays: number;
  noShiftDays: number;
}

export function groupPayrollByMember(rows: PayrollRow[]): PayrollMemberTotals[] {
  const map = new Map<string, PayrollMemberTotals>();
  for (const r of rows) {
    const m = map.get(r.crewMemberId) ?? {
      crewMemberId: r.crewMemberId, memberName: r.memberName, crewName: r.crewName,
      days: [], shiftHours: 0, jobHours: 0, extra: 0, total: 0,
      openPunches: 0, openShifts: 0, adjustedDays: 0, noShiftDays: 0,
    };
    m.days.push(r);
    m.shiftHours += r.baseHours;
    m.jobHours += r.jobHours;
    m.extra += r.extraHours;
    m.total += r.totalHours;
    m.openPunches += r.openPunches;
    if (r.openShift) m.openShifts += 1;
    if (r.adjusted) m.adjustedDays += 1;
    if (r.noShift) m.noShiftDays += 1;
    map.set(r.crewMemberId, m);
  }
  return [...map.values()];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function clock(iso: string | null, tz: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export const DAILY_HEADERS = [
  "Employee", "Crew", "Date", "Clock In", "Clock Out", "Break (min)", "Day Hours", "Job Hours", "Extra Hours", "Total Hours", "Note",
];

/** One row per person per day — numbers stay numbers so Excel and payroll uploads can sum them. */
export function dailyRows(members: PayrollMemberTotals[], tz: string): (string | number)[][] {
  return members.flatMap((m) =>
    m.days.map((d) => [
      m.memberName, d.crewName ?? "", d.workDate, clock(d.shiftStart, tz), clock(d.shiftEnd, tz), d.breakMinutes,
      r2(d.baseHours), r2(d.jobHours), r2(d.extraHours), r2(d.totalHours), d.note ?? "",
    ])
  );
}

export const SUMMARY_HEADERS = ["Employee", "Crew", "Days Worked", "Day Hours", "Extra Hours", "Total Hours"];

export function summaryRows(members: PayrollMemberTotals[]): (string | number)[][] {
  return members.map((m) => [
    m.memberName, m.crewName ?? "", m.days.filter((d) => d.totalHours > 0).length,
    r2(m.shiftHours), r2(m.extra), r2(m.total),
  ]);
}

export function periodLabel(from: string, to: string): string {
  return `${format(parseISO(from), "MMM d, yyyy")} – ${format(parseISO(to), "MMM d, yyyy")}`;
}
