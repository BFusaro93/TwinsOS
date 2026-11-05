import { stripHtml } from "@/lib/utils/strip-html";

/** True when an editor value has no visible text (the editor emits "<p></p>" when empty). */
export function isBlankRich(html: string | null | undefined): boolean {
  return !html || (!stripHtml(html).trim() && !/<img/i.test(html));
}

/**
 * A visit's crew note: the job-wide note first, then the note for the service
 * the visit belongs to. Both are editor HTML (or legacy plain text).
 */
export function composeVisitNote(jobNote: string | null | undefined, serviceNote: string | null | undefined): string | null {
  const parts = [jobNote, serviceNote].filter((n): n is string => !isBlankRich(n));
  return parts.length ? parts.join("<p></p>") : null;
}
