import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * GET /api/crm/weather?lat=..&lng=.. — forecast periods + active alerts from the National Weather
 * Service (api.weather.gov). Free, no API key, US coverage only, which matches the landscaping /
 * snow customer base. Proxied here because NWS asks for an identifying User-Agent and we don't
 * want browsers hitting it directly.
 */

const NWS = "https://api.weather.gov";
const HEADERS = { "User-Agent": "Landscapt (support@landscapt.com)", Accept: "application/geo+json" };

interface NwsPeriod {
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }
  // NWS grid lookups are keyed on ~4 decimals; rounding also lets the CDN cache neighbours together.
  const point = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  try {
    const pointRes = await fetch(`${NWS}/points/${point}`, { headers: HEADERS, next: { revalidate: 3600 } });
    if (!pointRes.ok) {
      return NextResponse.json(
        { error: pointRes.status === 404 ? "Weather isn't available for this location (US only)." : "Weather service unavailable" },
        { status: 502 }
      );
    }
    const pointJson = (await pointRes.json()) as { properties?: { forecast?: string } };
    const forecastUrl = pointJson.properties?.forecast;
    if (!forecastUrl) return NextResponse.json({ error: "No forecast for this location" }, { status: 502 });

    const [forecastRes, alertsRes] = await Promise.all([
      fetch(forecastUrl, { headers: HEADERS, next: { revalidate: 900 } }),
      fetch(`${NWS}/alerts/active?point=${point}`, { headers: HEADERS, next: { revalidate: 300 } }),
    ]);
    if (!forecastRes.ok) return NextResponse.json({ error: "Forecast unavailable" }, { status: 502 });

    const forecastJson = (await forecastRes.json()) as { properties?: { periods?: NwsPeriod[] } };
    const periods = (forecastJson.properties?.periods ?? []).map((p) => ({
      name: p.name,
      // The offset in startTime is the location's, so the date slice is the LOCAL calendar day.
      date: p.startTime.slice(0, 10),
      isDaytime: p.isDaytime,
      temperature: p.temperature,
      unit: p.temperatureUnit,
      wind: `${p.windDirection} ${p.windSpeed}`.trim(),
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      precipChance: p.probabilityOfPrecipitation?.value ?? null,
    }));

    let alerts: { event: string; severity: string; headline: string }[] = [];
    if (alertsRes.ok) {
      const alertsJson = (await alertsRes.json()) as {
        features?: { properties?: { event?: string; severity?: string; headline?: string } }[];
      };
      alerts = (alertsJson.features ?? []).map((f) => ({
        event: f.properties?.event ?? "Alert",
        severity: f.properties?.severity ?? "Unknown",
        headline: f.properties?.headline ?? "",
      }));
    }

    return NextResponse.json({ periods, alerts });
  } catch {
    return NextResponse.json({ error: "Weather service unavailable" }, { status: 502 });
  }
}
