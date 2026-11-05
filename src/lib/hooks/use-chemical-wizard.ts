"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { ConditionsReading } from "@/lib/weather/nws-conditions";

export type { ConditionsReading };

const CHUNK = 150;

/** visitId -> when its Notice of Treatment email was last sent (absent = never sent). */
export function useChemicalNoticeStatus(visitIds: string[], enabled = true) {
  return useQuery({
    queryKey: ["chemical-notice-status", [...visitIds].sort()],
    enabled: enabled && visitIds.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const supabase = createClient();
      const sent = new Map<string, string>();
      for (let i = 0; i < visitIds.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("crm_chemical_application_emails")
          .select("visit_id, sent_at")
          .in("visit_id", visitIds.slice(i, i + CHUNK))
          .eq("email_type", "chemical_application");
        if (error) throw error;
        for (const row of data ?? []) {
          if (!row.visit_id) continue;
          const prev = sent.get(row.visit_id);
          if (!prev || row.sent_at > prev) sent.set(row.visit_id, row.sent_at);
        }
      }
      return sent;
    },
  });
}

/** What a weather lookup came back with. `reading: null` = no weather for that place and time
 *  (not located, outside the US, no station answered); `unreachable` = the request itself failed
 *  (offline, or the weather service is down), which the user should retry rather than type over. */
export type JobConditionsResult =
  | { ok: true; reading: ConditionsReading | null }
  | { ok: false; reason: "unreachable" };

/**
 * Temperature and wind at a job's location from the National Weather Service (the same service as
 * the dispatch board's weather chip), at `at` (ISO) or now. Never throws.
 */
export async function fetchJobConditions(jobId: string, at?: string): Promise<JobConditionsResult> {
  try {
    const geo = await fetch("/api/crm/jobs/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: [jobId] }),
    });
    // The geocode route answers 422 for an address it can't place: that is "no weather here".
    if (!geo.ok) return geo.status >= 500 ? { ok: false, reason: "unreachable" } : { ok: true, reading: null };
    const point = ((await geo.json().catch(() => ({}))) as { results?: { lat: number; lng: number }[] }).results?.[0];
    if (!point) return { ok: true, reading: null };
    const qs = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng), ...(at ? { at } : {}) });
    const res = await fetch(`/api/crm/weather/conditions?${qs.toString()}`);
    if (!res.ok) return { ok: false, reason: "unreachable" };
    return { ok: true, reading: ((await res.json()) as { reading: ConditionsReading | null }).reading };
  } catch {
    // fetch rejects on a dropped or blocked connection.
    return { ok: false, reason: "unreachable" };
  }
}

export interface ConditionsValues {
  temperature: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  phLevel: number | null;
}

/** Writes the same conditions onto every chemical record of the given visits that was actually
 *  applied — a "Not used" row has no conditions to record. */
export function useApplyConditionsToVisits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitIds, values }: { visitIds: string[]; values: Partial<ConditionsValues> }) => {
      const supabase = createClient();
      const patch = {
        ...(values.temperature !== undefined && { temperature: values.temperature }),
        ...(values.windSpeed !== undefined && { wind_speed: values.windSpeed }),
        ...(values.windDirection !== undefined && { wind_direction: values.windDirection }),
        ...(values.phLevel !== undefined && { ph_level: values.phLevel }),
      };
      if (Object.keys(patch).length === 0) return 0;
      let updated = 0;
      for (let i = 0; i < visitIds.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("crm_chemical_applications")
          .update(patch as never)
          .in("visit_id", visitIds.slice(i, i + CHUNK))
          .eq("used", true)
          .is("deleted_at", null)
          .select("id");
        if (error) throw error;
        updated += data?.length ?? 0;
      }
      return updated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chemical-applications"] });
    },
  });
}
