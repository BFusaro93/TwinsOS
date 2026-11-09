/**
 * Display order for crew equipment: vehicles first, then trailers, then everything else.
 * Shared by the crew board (office) and the crew app so both list a crew's gear the same way.
 *
 * An asset typed "Vehicle" counts as a vehicle (it used to fall in with plain equipment because
 * only truck/van/pickup matched). A trailer is checked first so a trailer kept in the vehicles
 * list still sorts after the trucks.
 */
export function equipmentRank(kind: "asset" | "vehicle", type: string | null | undefined): { isVehicle: boolean; rank: number } {
  const trailer = /trailer/i.test(type ?? "");
  const truck = !trailer && (kind === "vehicle" || /vehicle|truck|\bvan\b|pickup/i.test(type ?? ""));
  return { isVehicle: truck || trailer, rank: truck ? 0 : trailer ? 1 : 2 };
}
