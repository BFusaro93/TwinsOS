"use client";

import { AlertTriangle, CloudSun } from "lucide-react";
import { useQuery } from "@/lib/hooks/use-query";
import { useJobCoords, type JobCoord } from "@/lib/hooks/use-job-coords";
import { cn } from "@/lib/utils";

interface WeatherPeriod {
  name: string;
  date: string;
  isDaytime: boolean;
  temperature: number;
  unit: string;
  wind: string;
  shortForecast: string;
  detailedForecast: string;
  precipChance: number | null;
}
interface WeatherAlert {
  event: string;
  severity: string;
  headline: string;
}
interface WeatherBody {
  periods: WeatherPeriod[];
  alerts: WeatherAlert[];
}

/**
 * National Weather Service forecast for the day's work, shown as a compact chip. The location is
 * the average of the jobs' coordinates (cached lat/lng first; one job is geocoded when none are
 * cached yet). NWS is US-only — outside it the chip simply doesn't render.
 */
export function DispatchWeather({
  date,
  jobs,
  className,
}: {
  /** The service day, yyyy-mm-dd. */
  date: string;
  jobs: { id: string; lat: number | null; lng: number | null }[];
  className?: string;
}) {
  const known = new Map<string, JobCoord>();
  for (const j of jobs) if (j.lat != null && j.lng != null) known.set(j.id, { lat: j.lat, lng: j.lng });

  // With nothing cached, locate a single job rather than the whole board.
  const probeId = known.size === 0 ? jobs[0]?.id : undefined;
  const { data: probe } = useJobCoords(probeId ? [probeId] : [], known, !!probeId);

  const points = [...known.values(), ...(probe?.coords.values() ?? [])];
  const center = points.length
    ? {
        lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
        lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
      }
    : null;

  const { data } = useQuery({
    queryKey: ["dispatch-weather", center ? center.lat.toFixed(2) : null, center ? center.lng.toFixed(2) : null],
    enabled: !!center,
    staleTime: 15 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<WeatherBody> => {
      const res = await fetch(`/api/crm/weather?lat=${center!.lat}&lng=${center!.lng}`);
      if (!res.ok) throw new Error("Weather unavailable");
      return (await res.json()) as WeatherBody;
    },
  });

  if (!data) return null;
  const day = data.periods.filter((p) => p.date === date);
  // NWS only publishes ~7 days ahead and nothing for past days.
  if (day.length === 0) return null;
  const dayPeriod = day.find((p) => p.isDaytime) ?? day[0];
  const night = day.find((p) => !p.isDaytime && p !== dayPeriod);
  const maxPrecip = Math.max(0, ...day.map((p) => p.precipChance ?? 0));
  const severeAlert = data.alerts[0];

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <span
        className="flex items-center gap-1.5 rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300"
        title={day.map((p) => `${p.name}: ${p.detailedForecast}`).join("\n\n")}
      >
        <CloudSun className="h-3.5 w-3.5" />
        {dayPeriod.shortForecast} · {dayPeriod.temperature}°{dayPeriod.unit}
        {night ? ` / ${night.temperature}°` : ""} · {dayPeriod.wind}
        {maxPrecip > 0 ? ` · ${maxPrecip}% precip` : ""}
      </span>
      {severeAlert && (
        <span
          className="flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
          title={data.alerts.map((a) => a.headline).join("\n")}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {severeAlert.event}
          {data.alerts.length > 1 ? ` +${data.alerts.length - 1}` : ""}
        </span>
      )}
    </div>
  );
}
