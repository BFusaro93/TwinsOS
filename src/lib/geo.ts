const EARTH_RADIUS_MILES = 3958.8;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line distance in miles between two coordinates — a free local
 *  approximation used for proximity checks (e.g. "is this waiting-list job
 *  near today's route?"), not for turn-by-turn driving distance. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
