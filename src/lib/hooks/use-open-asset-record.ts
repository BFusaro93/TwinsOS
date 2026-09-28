"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCMMSStore } from "@/stores";

/** Navigate to an asset or vehicle with its detail panel open (same as global search). */
export function useOpenAssetRecord() {
  const router = useRouter();
  const { setSelectedAssetId, setSelectedVehicleId } = useCMMSStore();
  return useCallback(
    (entityType: "asset" | "vehicle", id: string) => {
      if (entityType === "vehicle") {
        setSelectedVehicleId(id);
        router.push("/cmms/vehicles");
      } else {
        setSelectedAssetId(id);
        router.push("/cmms/assets");
      }
    },
    [router, setSelectedAssetId, setSelectedVehicleId]
  );
}
