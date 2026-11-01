// Pre-activation check for an automation. Nothing here blocks turning it on —
// the confirm lists what would make it silently do nothing (or send blanks).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

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
    supabase.from("crm_sequence_triggers").select("sequence_id").in("sequence_id", ids),
    supabase
      .from("crm_sequence_events")
      .select("sequence_id, event_type, config, is_active")
      .in("sequence_id", ids)
      .is("deleted_at", null),
  ]);
  const triggered = new Set(((triggers ?? []) as { sequence_id: string }[]).map((t) => t.sequence_id));
  const evs = (events ?? []) as { sequence_id: string; event_type: string; config: Record<string, unknown> | null; is_active: boolean }[];

  const text = (v: unknown) =>
    (typeof v === "string" ? v : "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();

  const warnings: string[] = [];
  for (const seq of sequences) {
    const label = `"${seq.name || "Untitled sequence"}"`;
    const steps = evs.filter((e) => e.sequence_id === seq.id && e.is_active);
    if (!triggered.has(seq.id)) warnings.push(`${label} has no trigger, so nothing will ever start it.`);
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
