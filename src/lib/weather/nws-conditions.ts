// Conditions at a location for the chemical application record (temperature, wind speed and
// direction), from the same National Weather Service the dispatch board's weather chip uses
// (api.weather.gov — free, no key, US only). The chip shows the FORECAST; a compliance record
// wants what it was actually like, so this reads the nearest station's observation, and falls
// back to the hourly forecast's current hour when no station has a recent reading.

const NWS = "https://api.weather.gov";
const HEADERS = { "User-Agent": "Landscapt (support@landscapt.com)", Accept: "application/geo+json" };
const TIMEOUT_MS = 6000;
/** Stations to try, nearest first, before falling back to the forecast. */
const MAX_STATIONS = 3;
/** An observation older than this (relative to the time asked about) isn't "conditions then". */
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
/** NWS keeps about a week of observations. */
const HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

export interface ConditionsReading {
  temperatureF: number | null;
  windMph: number | null;
  /** Compass point the wind blows FROM, e.g. "NW". */
  windDirection: string | null;
  description: string | null;
  /** When the reading was taken (observation) or starts (forecast period). */
  observedAt: string;
  source: "observation" | "forecast";
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function degreesToCompass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

interface Quantity { value: number | null; unitCode?: string }
interface Observation {
  timestamp: string;
  textDescription?: string | null;
  temperature?: Quantity;
  windSpeed?: Quantity;
  windDirection?: Quantity;
}

const round = (n: number, places = 0) => Math.round(n * 10 ** places) / 10 ** places;

function toReading(o: Observation): ConditionsReading | null {
  const c = o.temperature?.value;
  const kmh = o.windSpeed?.value;
  const deg = o.windDirection?.value;
  if (c == null && kmh == null) return null;
  const mph = kmh != null ? round(kmh / 1.609344) : null;
  return {
    temperatureF: c != null ? round(c * 1.8 + 32) : null,
    windMph: mph,
    // Calm air has no direction: NWS reports 0 degrees ("N") with a 0 speed, which put
    // "wind 0 mph N" on the application record.
    windDirection: deg != null && mph !== 0 ? degreesToCompass(deg) : null,
    description: o.textDescription?.trim() || null,
    observedAt: o.timestamp,
    source: "observation",
  };
}

/**
 * Conditions at (lat, lng). `at` is the moment the application happened (ISO); omitted = now.
 * Returns null outside the US or when nothing is available.
 */
export async function fetchConditions(lat: number, lng: number, at?: string): Promise<ConditionsReading | null> {
  const when = at ? new Date(at).getTime() : Date.now();
  if (!Number.isFinite(when)) return null;
  const isPast = when < Date.now() - 20 * 60 * 1000;
  if (isPast && Date.now() - when > HISTORY_MS) return null;

  const point = await getJson<{ properties?: { observationStations?: string; forecastHourly?: string } }>(
    `${NWS}/points/${lat.toFixed(4)},${lng.toFixed(4)}`
  );
  const stationsUrl = point?.properties?.observationStations;
  if (stationsUrl) {
    const stations = await getJson<{ features?: { properties?: { stationIdentifier?: string } }[] }>(stationsUrl);
    const ids = (stations?.features ?? []).map((f) => f.properties?.stationIdentifier).filter((s): s is string => !!s).slice(0, MAX_STATIONS);
    for (const id of ids) {
      let obs: Observation | null = null;
      if (isPast) {
        const start = new Date(when - MAX_AGE_MS).toISOString();
        const end = new Date(when + 60 * 60 * 1000).toISOString();
        const list = await getJson<{ features?: { properties?: Observation }[] }>(
          `${NWS}/stations/${id}/observations?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=50`
        );
        // The reading closest to the application time.
        const candidates = (list?.features ?? []).map((f) => f.properties).filter((p): p is Observation => !!p?.timestamp);
        candidates.sort((a, b) => Math.abs(new Date(a.timestamp).getTime() - when) - Math.abs(new Date(b.timestamp).getTime() - when));
        obs = candidates.find((o) => toReading(o)) ?? null;
      } else {
        const latest = await getJson<{ properties?: Observation }>(`${NWS}/stations/${id}/observations/latest`);
        obs = latest?.properties ?? null;
      }
      const reading = obs ? toReading(obs) : null;
      if (reading && Math.abs(new Date(reading.observedAt).getTime() - when) <= MAX_AGE_MS) return reading;
    }
  }

  // No recent station reading: the hourly forecast's current hour is the best available for "now".
  // (The 12-hour forecast's temperature is the period's high or low, not what it is right now, so
  // it skewed the temperature saved on the application record.)
  if (!isPast && point?.properties?.forecastHourly) {
    const forecast = await getJson<{
      properties?: { periods?: { startTime: string; endTime: string; temperature: number; temperatureUnit: string; windSpeed: string; windDirection: string; shortForecast: string }[] };
    }>(point.properties.forecastHourly);
    const periods = forecast?.properties?.periods ?? [];
    const p = periods.find((x) => new Date(x.startTime).getTime() <= when && when < new Date(x.endTime).getTime()) ?? periods[0];
    if (p) {
      const speeds = (p.windSpeed.match(/\d+/g) ?? []).map(Number);
      const mph = speeds.length ? Math.max(...speeds) : null;
      return {
        temperatureF: p.temperatureUnit === "C" ? round(p.temperature * 1.8 + 32) : p.temperature,
        windMph: mph,
        windDirection: mph !== 0 ? p.windDirection || null : null,
        description: p.shortForecast || null,
        observedAt: p.startTime,
        source: "forecast",
      };
    }
  }
  return null;
}
