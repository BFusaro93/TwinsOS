// Pre-activation check for an automation. Nothing here blocks turning it on —
// the confirm lists what would make it silently do nothing (or send blanks).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Date-gap trigger types (estimate_expiring, estimate_no_response) — they fire `days` before/after an anchor date. */
export const DATE_GAP_TRIGGER_TYPE_LIST = ["estimate_expiring", "estimate_no_response"] as const;

/** Day count a date-gap trigger uses when the builder left the box blank (the placeholder the builder shows). */
export const DEFAULT_DATE_GAP_DAYS = 7;

/**
 * The day count a date-gap trigger runs with: DEFAULT_DATE_GAP_DAYS when none was saved
 * (a blank box used to save no value, and the cron then skipped the trigger forever), the
 * saved whole number when it is positive, or null when the saved value is unusable
 * (zero, negative, not a number) — the cron skips those and activation warns about them.
 */
export function resolveDateGapDays(config: unknown): number | null {
  const raw = (config as { days?: unknown } | null | undefined)?.days;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_DATE_GAP_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export async function automationActivationWarnings(supabase: AnyClient, automationId: string): Promise<string[]> {
  const { data: seqs } = await supabase
    .from("crm_automation_sequences")
    .select("id, name")
    .eq("automation_id", automationId)
    .is("deleted_at", null);
  const sequences = (seqs ?? []) as { id: string; name: string | null }[];
  if (sequences.length === 0) return ["This automation has no sequences, so it will never run."];

  const ids = sequences.map((s) => s.id);
  const [{ data: triggers }, { data: events }] = await Promise.all([
    supabase.from("crm_sequence_triggers").select("sequence_id, trigger_type, config").in("sequence_id", ids),
    supabase
      .from("crm_sequence_events")
      .select("sequence_id, event_type, config, is_active")
      .in("sequence_id", ids)
      .is("deleted_at", null),
  ]);
  const triggerRows = (triggers ?? []) as { sequence_id: string; trigger_type: string; config: unknown }[];
  const triggered = new Set(triggerRows.map((t) => t.sequence_id));
  const evs = (events ?? []) as { sequence_id: string; event_type: string; config: Record<string, unknown> | null; is_active: boolean }[];

  const text = (v: unknown) =>
    (typeof v === "string" ? v : "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();

  const warnings: string[] = [];
  for (const seq of sequences) {
    const label = `"${seq.name || "Untitled sequence"}"`;
    const steps = evs.filter((e) => e.sequence_id === seq.id && e.is_active);
    if (!triggered.has(seq.id)) warnings.push(`${label} has no trigger, so nothing will ever start it.`);
    const badDays = triggerRows.some(
      (t) =>
        t.sequence_id === seq.id &&
        (DATE_GAP_TRIGGER_TYPE_LIST as readonly string[]).includes(t.trigger_type) &&
        resolveDateGapDays(t.config) === null
    );
    if (badDays) warnings.push(`${label} has an estimate date trigger whose number of days isn't a whole number of 1 or more — that trigger will never fire.`);
    if (steps.length === 0) {
      warnings.push(`${label} has no active steps.`);
      continue;
    }
    if (steps.every((e) => e.event_type === "wait")) warnings.push(`${label} only contains Wait steps — it does nothing.`);
    for (const e of steps) {
      const c = e.config ?? {};
      if (e.event_type === "email" && !text(c.subject) && !text(c.bodyHtml ?? c.body)) {
        warnings.push(`${label} has an Email step with no subject or message — it will be skipped.`);
      }
      if (e.event_type === "text_message" && !text(c.message)) {
        warnings.push(`${label} has a Text Message step with no message — it will be skipped.`);
      }
    }
  }
  return [...new Set(warnings)];
}
