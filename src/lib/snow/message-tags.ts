/**
 * Snow merge tags — [stormname], [stormdate], [snowservice], [snowcrew],
 * [snowstatus], [snowarrival], [snowaddress].
 *
 * Pure and client-safe: the snow board's compose dialog fills them per
 * recipient from the stop it already has loaded, and the automation engine
 * fills them server-side from the client's latest snow visit
 * (src/lib/automations/snow-extras.ts). Both go through snowTagValues so the
 * wording is identical wherever the same template is used.
 */

export const SNOW_TAG_KEYS = [
  "[stormname]",
  "[stormdate]",
  "[snowservice]",
  "[snowcrew]",
  "[snowstatus]",
  "[snowarrival]",
  "[snowaddress]",
] as const;

export type SnowTagContext = {
  stormName: string | null;
  /** Calendar day, "YYYY-MM-DD" — never shifted by a time zone. */
  stormDate: string | null;
  service: string | null;
  crew: string | null;
  /** crm_job_visits.status */
  status: string | null;
  /** "HH:MM" or "HH:MM:SS" on the org's clock, when the stop has a scheduled time. */
  startTime: string | null;
  address: string | null;
};

/** Customer-facing wording for a visit status. */
export function snowStatusWording(status: string | null | undefined): string {
  switch (status) {
    case "dispatched": return "on our way";
    case "in_progress": return "in progress";
    case "completed": return "complete";
    case "cancelled": return "cancelled";
    case "skipped": return "skipped";
    default: return "scheduled";
  }
}

function longDay(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function clockLabel(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  const h12 = ((hh + 11) % 12) + 1;
  return `around ${h12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
}

/** Raw (unescaped) tag → value map; callers escape for HTML where needed. */
export function snowTagValues(ctx: SnowTagContext): Record<string, string> {
  return {
    "[stormname]": ctx.stormName ?? "",
    "[stormdate]": longDay(ctx.stormDate),
    "[snowservice]": ctx.service ?? "",
    "[snowcrew]": ctx.crew ?? "",
    "[snowstatus]": snowStatusWording(ctx.status),
    "[snowarrival]": clockLabel(ctx.startTime),
    "[snowaddress]": ctx.address ?? "",
  };
}

/** Replaces only the snow tags in `template`, leaving every other [tag] for the send route. */
export function resolveSnowTags(
  template: string,
  values: Record<string, string>,
  escape: (s: string) => string = (s) => s,
): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    return key in values ? escape(values[key] ?? "") : match;
  });
}
