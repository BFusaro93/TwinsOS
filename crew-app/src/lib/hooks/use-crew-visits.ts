import { useCallback, useEffect, useState } from 'react';

import { fetchCrewVisits } from '@/lib/api';
import type { CrewVisit } from '@/lib/types';

interface UseCrewVisitsResult {
  visits: CrewVisit[];
  crewName: string | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Loads the signed-in crew's visits for `date` via GET
 * /api/crm/crew/visits. Deliberately plain fetch + local state rather than
 * TanStack Query — Phase 2 has no caching/background-refetch requirements
 * (that arrives with Phase 3's offline queue), so a query library would add
 * ceremony without buying anything yet.
 */
export function useCrewVisits(date: string): UseCrewVisitsResult {
  const [visits, setVisits] = useState<CrewVisit[]>([]);
  const [crewName, setCrewName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isInitial: boolean) => {
    if (isInitial) setIsLoading(true);
    else setIsRefetching(true);
    setError(null);
    try {
      const data = await fetchCrewVisits(date);
      setVisits(data.visits);
      setCrewName(data.crewName);
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

  return { visits, crewName, isLoading, isRefetching, error, refetch };
}
