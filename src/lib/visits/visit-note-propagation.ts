/**
 * A visit's crew note is read live from the job note, the service note and the
 * note written on the visit (see visitNoteSections), so editing a service note
 * reaches every visit by itself. What it can't reach is the crew's "new note"
 * flag, which is keyed off the visit's notes_to_crew_updated_at: this stamps it on
 * the service's upcoming, not-yet-started visits (and whole-job visits) so the crew
 * is asked to re-read. A job note edit needs nothing — the job row stamps itself.
 */
export async function flagServiceNoteChanged(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { jobId, jobServiceId, fromDate }: { jobId: string; jobServiceId: string; fromDate: string }
): Promise<void> {
  const { error } = await supabase
    .from("crm_job_visits")
    .update({ notes_to_crew_updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .or(`job_service_id.eq.${jobServiceId},job_service_id.is.null`)
    .gte("scheduled_date", fromDate)
    .in("status", ["scheduled", "dispatched"])
    .is("clocked_in_at", null)
    .is("deleted_at", null);
  if (error) throw error;
}
