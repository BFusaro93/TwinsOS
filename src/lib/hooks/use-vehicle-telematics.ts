import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
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
