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

/** The pieces a visit's crew note is read from. */
export interface VisitNoteSource {
  notesToCrew?: string | null;
  jobServiceId?: string | null;
  job?: {
    notesToCrew?: string | null;
    propertyNotesToCrew?: string | null;
    services?: { id: string; jobNote?: string | null; sortOrder?: number | null }[] | null;
  } | null;
}

export type VisitNoteKind = "job" | "service" | "visit" | "property";

export interface VisitNoteSection {
  kind: VisitNoteKind;
  /** Office-facing label; the crew app shows the notes without one. */
  label: string;
  html: string;
}

function serviceNotesFor(v: VisitNoteSource): string[] {
  const services = [...(v.job?.services ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const mine = v.jobServiceId ? services.filter((s) => s.id === v.jobServiceId) : services;
  return mine.map((s) => s.jobNote).filter((n): n is string => !isBlankRich(n));
}

/**
 * The note written on this visit alone. Visits used to store a copy of the job
 * note plus the service note in notes_to_crew; that copy is now read live from
 * the job and service, so a stored value that is only such a copy is not a
 * visit note and comes back null.
 */
export function visitOwnNote(v: VisitNoteSource): string | null {
  const own = v.notesToCrew;
  if (isBlankRich(own)) return null;
  const jobNote = v.job?.notesToCrew ?? null;
  const services = [...(v.job?.services ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const copies = [
    jobNote,
    composeVisitNote(jobNote, v.jobServiceId ? services.find((s) => s.id === v.jobServiceId)?.jobNote ?? null : services.map((s) => s.jobNote)),
    composeVisitNote(jobNote, null),
  ];
  return copies.some((c) => c !== null && c === own) ? null : (own as string);
}

/**
 * Every crew note that applies to a visit, in reading order and kept apart:
 * the job note, this service's note, the note written on the visit itself, and
 * the property's standing note. Nothing is stored combined, so editing the job
 * or service note reaches every visit at once and a note written on one visit
 * is never overwritten.
 */
export function visitNoteSections(v: VisitNoteSource): VisitNoteSection[] {
  const sections: VisitNoteSection[] = [];
  const seen = new Set<string>();
  const add = (kind: VisitNoteKind, label: string, html: string | null | undefined) => {
    if (isBlankRich(html)) return;
    const key = stripHtml(html as string).trim();
    if (seen.has(key)) return;
    seen.add(key);
    sections.push({ kind, label, html: html as string });
  };
  add("job", "Job note", v.job?.notesToCrew);
  for (const n of serviceNotesFor(v)) add("service", "Service note", n);
  add("visit", "Visit note", visitOwnNote(v));
  add("property", "Property note", v.job?.propertyNotesToCrew);
  return sections;
}
