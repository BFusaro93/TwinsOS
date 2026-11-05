import { stripHtml } from "@/lib/utils/strip-html";

/** True when an editor value has no visible text (the editor emits "<p></p>" when empty). */
export function isBlankRich(html: string | null | undefined): boolean {
  return !html || (!stripHtml(html).trim() && !/<img/i.test(html));
}

type NoteValue = string | null | undefined;

/**
 * A visit's crew note: the job-wide note first, then the note for the service
 * the visit belongs to. Both are editor HTML (or legacy plain text). A visit
 * that does the whole job (no job_service_id) passes every service's note, so
 * per-line crew notes from the estimate still reach the crew.
 */
export function composeVisitNote(jobNote: NoteValue, serviceNote: NoteValue | NoteValue[]): string | null {
  const serviceNotes = Array.isArray(serviceNote) ? serviceNote : [serviceNote];
  const parts = [jobNote, ...serviceNotes].filter((n): n is string => !isBlankRich(n));
  return parts.length ? parts.join("<p></p>") : null;
}
