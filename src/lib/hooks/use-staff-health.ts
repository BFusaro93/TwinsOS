import { useQuery } from "@/lib/hooks/use-query";
import type { HealthCheckResult, UptimeMonitor } from "@/lib/health/checks";

export interface StaffHealthSnapshot {
  checkedAt: string;
  checks: HealthCheckResult[];
  uptime: UptimeMonitor[] | null;
}

/** Staff-only system health. The route enforces is_staff(); `refresh` bypasses its 60s cache. */
export function useStaffHealth() {
  return useQuery({
    queryKey: ["staff-health"],
    queryFn: async (): Promise<StaffHealthSnapshot> => {
      const res = await fetch("/api/internal/health");
      if (!res.ok) throw new Error(`Health check failed (${res.status})`);
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

export async function fetchFreshStaffHealth(): Promise<StaffHealthSnapshot> {
  const res = await fetch("/api/internal/health?refresh=1");
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}
