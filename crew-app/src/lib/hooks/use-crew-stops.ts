import { useCallback, useEffect, useState } from 'react';

import { fetchCrewVisits } from '@/lib/api';
import type { CrewDriveInfo, CrewStop } from '@/lib/types';

interface UseCrewStopsResult {
  stops: CrewStop[];
  crewName: string | null;
  drive: CrewDriveInfo;
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
export function useCrewStops(date: string): UseCrewStopsResult {
  const [stops, setStops] = useState<CrewStop[]>([]);
  const [crewName, setCrewName] = useState<string | null>(null);
  const [drive, setDrive] = useState<CrewDriveInfo>(EMPTY_DRIVE);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isInitial: boolean) => {
    if (isInitial) setIsLoading(true);
    else setIsRefetching(true);
    setError(null);
    try {
      const data = await fetchCrewVisits(date);
      setStops(data.stops);
      setCrewName(data.crewName);
      setDrive(data.drive ?? EMPTY_DRIVE);
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

  return { stops, crewName, drive, isLoading, isRefetching, error, refetch };
}
