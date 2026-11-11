import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchCrewVisits } from '@/lib/api';
import { subscribeScheduleRefresh } from '@/lib/hooks/schedule-refresh';
import type { CrewDriveInfo, CrewStop } from '@/lib/types';

export interface PhotoRules {
  requireBefore: boolean;
  requireAfter: boolean;
}
const NO_RULES: PhotoRules = { requireBefore: false, requireAfter: false };

interface UseCrewStopsResult {
  /** The day the server answered for (the org's today when no date was passed). */
  date: string | null;
  /** The org's IANA timezone, once the server has said (older servers: null). */
  timeZone: string | null;
  stops: CrewStop[];
  crewName: string | null;
  drive: CrewDriveInfo;
  /** Org-wide required Before / After photos. */
  photoRules: PhotoRules;
  isLoading: boolean;
  isRefetching: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY_DRIVE: CrewDriveInfo = { openSegment: null, totalMinutes: 0 };

/**
 * Loads the signed-in crew's stop-grouped schedule for `date` via GET
 * /api/crm/crew/visits, which returns `stops` (grouped the same way the web
 * crew page's useMyCrewStops() groups them — see
 * src/lib/utils/visit-stops.ts) alongside the day-level drive-time segments.
 * Renamed from use-crew-visits.ts's useCrewVisits() when crew-app moved from
 * a flat per-visit list to the stop model; deliberately still plain fetch +
 * local state rather than TanStack Query, matching that hook's own note.
 */
export function useCrewStops(date?: string): UseCrewStopsResult {
  // `date` omitted = the ORG's today, decided by the server on every load (see
  // fetchCrewVisits). The screens used to pass a module-level date computed
  // once at launch from the phone's clock, so an app left open overnight (or a
  // phone in another timezone) kept showing yesterday's route.
  const [answeredDate, setAnsweredDate] = useState<string | null>(date ?? null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [stops, setStops] = useState<CrewStop[]>([]);
  const [crewName, setCrewName] = useState<string | null>(null);
  const [drive, setDrive] = useState<CrewDriveInfo>(EMPTY_DRIVE);
  const [photoRules, setPhotoRules] = useState<PhotoRules>(NO_RULES);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isInitial: boolean) => {
    if (isInitial) setIsLoading(true);
    else setIsRefetching(true);
    setError(null);
    try {
      const data = await fetchCrewVisits(date);
      setAnsweredDate(data.date ?? date ?? null);
      setTimeZone(data.timeZone ?? null);
      setStops(data.stops);
      setCrewName(data.crewName);
      setDrive(data.drive ?? EMPTY_DRIVE);
      setPhotoRules(data.photoRules ?? NO_RULES);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      if (isInitial) setIsLoading(false);
      else setIsRefetching(false);
    }
  }, [date]);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refetch = useCallback(() => load(false), [load]);

  // A push (new assignment, dispatcher note) asks every mounted schedule to refresh.
  useEffect(() => subscribeScheduleRefresh(() => void load(false)), [load]);

  // Coming back to the app (left open overnight, or after a call) reloads, so
  // the org's new day shows without needing a screen change.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(false);
    });
    return () => sub.remove();
  }, [load]);

  return { date: answeredDate, timeZone, stops, crewName, drive, photoRules, isLoading, isRefetching, error, refetch };
}
