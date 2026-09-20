// ============================================================
// Back-compat shim over lib/time/zone.
//
// These helpers predate per-org timezones and hardcoded America/New_York.
// The primitives now live in @/lib/time/zone and take the zone explicitly;
// everything here binds that zone to DEFAULT_TIME_ZONE.
//
// That default is correct ONLY for an Eastern tenant. Anything that runs in a
// known org's context — a report, a cron iterating orgs, a route that has an
// orgId — must resolve the org's own zone (getOrgTimeZone / ReportContext
// .timeZone / useOrgTimeZone) and call the zone-taking functions directly.
// Reach for these only where no org is in scope.
// ============================================================

import {
  DEFAULT_TIME_ZONE,
  isoInZone,
  todayInZoneAsLocalMidnight,
  zoneDateParts,
} from "@/lib/time/zone";

export { ymd, shiftYmd, mondayOfYmd } from "@/lib/time/zone";

/** {year, month (0-based), day} of `d` in the platform default zone. */
export function nyDateParts(d: Date): { year: number; month: number; day: number } {
  return zoneDateParts(d, DEFAULT_TIME_ZONE);
}

/** The calendar date ("YYYY-MM-DD") that `d` falls on in the default zone. */
export function isoNy(d: Date): string {
  return isoInZone(d, DEFAULT_TIME_ZONE);
}

/** Host-local midnight of today's date in the default zone. */
export function companyTodayAsLocalMidnight(): Date {
  return todayInZoneAsLocalMidnight(DEFAULT_TIME_ZONE);
}
