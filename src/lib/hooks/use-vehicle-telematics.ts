import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { mapTelematicsRow, type TelematicsRow } from "@/lib/samsara/telematics";
import type { TelematicsRefreshResult, VehicleTelematicsSnapshot } from "@/types/telematics";

const key = (vehicleId: string) => ["vehicle-telematics", vehicleId] as const;

/** The last stored Samsara snapshot for a vehicle (instant; no Samsara call). */
export function useVehicleTelematics(vehicleId: string) {
  return useQuery<VehicleTelematicsSnapshot | null>({
    queryKey: key(vehicleId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vehicle_telematics_snapshots")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapTelematicsRow(data as unknown as TelematicsRow) : null;
    },
  });
}

/** Pulls fresh values from Samsara and puts them straight into the snapshot cache. */
export function useRefreshVehicleTelematics(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation<TelematicsRefreshResult, Error>({
    mutationFn: async () => {
      const res = await fetch(`/api/vehicles/${vehicleId}/telematics`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<TelematicsRefreshResult>;
      if (!res.ok) throw new Error(body.error ?? "Telematics refresh failed");
      return body as TelematicsRefreshResult;
    },
    onSuccess: (result) => {
      if (result.status === "ok") queryClient.setQueryData(key(vehicleId), result.snapshot);
    },
  });
}

export interface TelematicsHistoryPoint {
  /** ISO hour the sample was taken. */
  recordedAt: string;
  fuelPercent: number | null;
  batteryVolts: number | null;
}

/** Hourly fuel / battery samples for the last `days` days, oldest first. */
export function useVehicleTelematicsHistory(vehicleId: string, days: number) {
  return useQuery<TelematicsHistoryPoint[]>({
    queryKey: ["vehicle-telematics-history", vehicleId, days],
    queryFn: async () => {
      const supabase = createClient();
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      // 90 days of hourly samples is ~2,200 rows — past PostgREST's 1,000-row response cap.
      const rows = await fetchAllRows<{
        recorded_at: string;
        fuel_percent: number | string | null;
        battery_milli_volts: number | null;
      }>(
        () =>
          supabase
            .from("vehicle_telematics_history")
            .select("id, recorded_at, fuel_percent, battery_milli_volts")
            .eq("vehicle_id", vehicleId)
            .is("deleted_at", null)
            .gte("recorded_at", since)
            .order("recorded_at", { ascending: true }),
      );
      return rows.map((r) => ({
        recordedAt: r.recorded_at,
        fuelPercent: r.fuel_percent == null ? null : Number(r.fuel_percent),
        batteryVolts: r.battery_milli_volts == null ? null : r.battery_milli_volts / 1000,
      }));
    },
  });
}

/**
 * Whether Samsara is switched on for the caller's org. The integrations row is
 * admin-only (it holds the API key), so this asks a SECURITY DEFINER function
 * that returns only the yes/no.
 */
export function useSamsaraEnabled() {
  return useQuery<boolean>({
    queryKey: ["samsara-enabled"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("samsara_enabled");
      if (error) throw error;
      return data === true;
    },
    staleTime: 5 * 60_000,
  });
}
