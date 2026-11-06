import { composeVisitNote } from "@/lib/utils/visit-note";

type NoteValue = string | null | undefined;

/** The crew-note inputs a job's visit notes are composed from. */
export interface VisitNoteSources {
  jobNote: NoteValue;
  /** job_service_id → that service's crew note, in service order (see serviceNoteMap). */
  serviceNotes: Map<string, NoteValue>;
}

/** job_service_id → crew note, in sort order — the order visit notes are composed in. */
export function serviceNoteMap(services: { id: string; sortOrder?: number | null; jobNote?: string | null }[]): Map<string, NoteValue> {
  return new Map(
    [...services]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((s) => [s.id, s.jobNote ?? null] as const)
  );
}

function expectedNotes(src: VisitNoteSources, jobServiceId: string | null): (string | null)[] {
  if (jobServiceId) return [composeVisitNote(src.jobNote, src.serviceNotes.get(jobServiceId) ?? null)];
  // A whole-job visit carries every service's note; older ones only the job note.
  return [composeVisitNote(src.jobNote, Array.from(src.serviceNotes.values())), composeVisitNote(src.jobNote, null)];
}

/**
 * Carry a changed job note or service note onto a job's upcoming, not-yet-started
 * visits that still hold the unmodified composed copy of the previous notes. A visit
 * whose note someone edited by hand matches neither variant and is left alone.
 * Returns the number of visits updated.
 */
export async function propagateVisitNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { jobId, fromDate, prev, next }: { jobId: string; fromDate: string; prev: VisitNoteSources; next: VisitNoteSources }
): Promise<number> {
  const { data, error } = await supabase
    .from("crm_job_visits")
    .select("id, job_service_id, notes_to_crew")
    .eq("job_id", jobId)
    .gte("scheduled_date", fromDate)
    .in("status", ["scheduled", "dispatched"])
    .is("clocked_in_at", null)
    .is("deleted_at", null);
  if (error) throw error;

  const byNewNote = new Map<string, { note: string | null; ids: string[] }>();
  for (const v of (data ?? []) as { id: string; job_service_id: string | null; notes_to_crew: string | null }[]) {
    const current = v.notes_to_crew ?? null;
    const prevVariants = expectedNotes(prev, v.job_service_id);
    const matched = prevVariants.findIndex((n) => n === current);
    if (matched === -1) continue;
    const nextNote = expectedNotes(next, v.job_service_id)[matched];
    if (nextNote === current) continue;
    const key = nextNote ?? "\u0000null";
    const group = byNewNote.get(key) ?? { note: nextNote, ids: [] };
    group.ids.push(v.id);
    byNewNote.set(key, group);
  }

  let updated = 0;
  for (const { note, ids } of byNewNote.values()) {
    for (let i = 0; i < ids.length; i += 100) {
      const slice = ids.slice(i, i + 100);
      const { error: upErr } = await supabase.from("crm_job_visits").update({ notes_to_crew: note }).in("id", slice);
      if (upErr) throw upErr;
      updated += slice.length;
    }
  }
  return updated;
}
