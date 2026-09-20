"use client";

import { useCallback } from "react";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import {
  DEFAULT_TIME_ZONE,
  formatInZone,
  isoInZone,
  todayInZone,
} from "@/lib/time/zone";

/**
 * The org's operating timezone, for anything that has to agree with the crew
 * and the office rather than with the viewer's laptop.
 *
 * Returns DEFAULT_TIME_ZONE while the org row is still loading. That's a real
 * tradeoff: for the ~one render before the query resolves, a Pacific org can
 * paint an Eastern date and then correct itself. The alternative — rendering
 * nothing until the timezone is known — would block the dispatch board on a
 * settings fetch, which is worse. Reads from the ["org-settings"] query that
 * the app already loads, so this costs no extra request.
 */
export function useOrgTimeZone(): string {
  const { data } = useOrgSettings();
  return data?.timezone ?? DEFAULT_TIME_ZONE;
}

/**
 * Date helpers already bound to the org's zone, so a component never has to
 * remember to thread it through.
 *
 * - `today()`    — today's date ("YYYY-MM-DD") on the org's calendar
 * - `toISODate()`— which org-calendar date a given instant fell on
 * - `format()`   — render an instant as it reads on the org's wall clock
 */
export function useOrgDates() {
  const timeZone = useOrgTimeZone();

  const today = useCallback(() => todayInZone(timeZone), [timeZone]);
  const toISODate = useCallback((d: Date) => isoInZone(d, timeZone), [timeZone]);
  const format = useCallback(
    (iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
      formatInZone(iso, timeZone, opts),
    [timeZone]
  );

  return { timeZone, today, toISODate, format };
}
