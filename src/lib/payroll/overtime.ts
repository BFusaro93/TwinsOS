import { mondayOfYmd, shiftYmd } from "@/lib/time/zone";
import { payrollPersonKey, type PayrollRow } from "@/lib/payroll/compute";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * The org's overtime rule (organizations.customizations.overtime), set under
 * Settings → Organization. One of:
 *   - weekly: hours over `weeklyHours` (default 40) in a Monday–Sunday workweek
 *   - daily:  hours over `dailyHours` (default 8) in one work day
 * Only WORKED hours count toward the threshold: day hours (or the office's
 * hour override) plus Extra hours. PTO hours are paid and always Regular — they
 * never push anyone into overtime (owner rule).
 *
 * Pure apart from getOvertimeRule's read: safe in client components.
 */
export type OvertimeMode = "weekly" | "daily";

export interface OvertimeRule {
  mode: OvertimeMode;
  weeklyHours: number;
  dailyHours: number;
}

export const DEFAULT_OVERTIME_RULE: OvertimeRule = { mode: "weekly", weeklyHours: 40, dailyHours: 8 };

const r2 = (n: number) => Math.round(n * 100) / 100;

function positiveHours(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 168 ? n : fallback;
}

/** Reads the rule from organizations.customizations, filling in the defaults. */
export function parseOvertimeRule(customizations: unknown): OvertimeRule {
  const raw = (customizations as Record<string, unknown> | null | undefined)?.overtime as Record<string, unknown> | undefined;
  return {
    mode: raw?.mode === "daily" ? "daily" : "weekly",
    weeklyHours: positiveHours(raw?.weeklyHours, DEFAULT_OVERTIME_RULE.weeklyHours),
    dailyHours: positiveHours(raw?.dailyHours, DEFAULT_OVERTIME_RULE.dailyHours),
  };
}

/** The org's rule; the default (weekly over 40) on a failed read. */
export async function getOvertimeRule(supabase: AnySupabase, orgId: string): Promise<OvertimeRule> {
  try {
    const { data } = await supabase.from("organizations").select("customizations").eq("id", orgId).maybeSingle();
    return parseOvertimeRule(data?.customizations);
  } catch {
    return DEFAULT_OVERTIME_RULE;
  }
}

/** "Overtime: hours over 40 in a Monday–Sunday week" — for the report and exports. */
export function describeOvertimeRule(rule: OvertimeRule): string {
  return rule.mode === "daily"
    ? `Overtime: hours over ${rule.dailyHours} in a day`
    : `Overtime: hours over ${rule.weeklyHours} in a Monday–Sunday week`;
}

/**
 * The dates payroll must be computed over so overtime is right at the edges of
 * [from, to]: for a weekly rule, out to whole Monday–Sunday weeks (hours worked
 * earlier in a week count toward its threshold even when the pay period starts
 * mid-week). A daily rule needs nothing extra.
 */
export function overtimeComputeRange(rule: OvertimeRule, from: string, to: string): { from: string; to: string } {
  if (rule.mode === "daily") return { from, to };
  return { from: mondayOfYmd(from), to: shiftYmd(mondayOfYmd(to), 6) };
}

/**
 * Splits each row's totalHours into regularHours + overtimeHours (in place).
 * Thresholds are per PERSON (payrollPersonKey — the employee, so someone on two
 * crews, or moved between crews, has all their hours counted together).
 * Weekly: per person and workweek, days are taken in date order and the hours
 * past the threshold are overtime on the day they happen. Daily: each day's
 * hours past the threshold (a person's rows on the same day share it).
 * `rows` must cover whole weeks for a weekly rule (overtimeComputeRange).
 */
export function applyOvertime(rows: PayrollRow[], rule: OvertimeRule): PayrollRow[] {
  // PTO is paid but never overtime: split only the worked part, then add PTO to Regular.
  const pto = (r: PayrollRow) => Math.max(0, r.ptoHours ?? 0);
  const workedOf = (r: PayrollRow) => Math.max(0, r.totalHours - pto(r));
  const threshold = rule.mode === "daily" ? rule.dailyHours : rule.weeklyHours;
  const groups = new Map<string, PayrollRow[]>();
  for (const r of rows) {
    const period = rule.mode === "daily" ? r.workDate : mondayOfYmd(r.workDate);
    const k = `${payrollPersonKey(r)}|${period}`;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  for (const days of groups.values()) {
    // Date order, then (same day on two memberships) the earlier start first.
    days.sort((a, b) =>
      a.workDate.localeCompare(b.workDate)
      || (a.shiftStart ?? "").localeCompare(b.shiftStart ?? "")
      || a.crewMemberId.localeCompare(b.crewMemberId)
    );
    let worked = 0;
    for (const r of days) {
      const dayWorked = workedOf(r);
      const regular = Math.min(dayWorked, Math.max(0, threshold - worked));
      r.regularHours = r2(regular + pto(r));
      r.overtimeHours = r2(dayWorked - regular);
      worked += dayWorked;
    }
  }
  return rows;
}
