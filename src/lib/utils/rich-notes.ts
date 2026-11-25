import { looksLikeHtml } from "@/lib/utils/sanitize-html";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * Flatten a job note to plain text.
 *
 * Job notes are authored in a rich-text editor and stored as an HTML
 * fragment, but older rows (and notes copied from an estimate, or typed into
 * the visit-level plain-text box) are plain strings. Anything that can't
 * render markup — push/SMS previews, table cells, CSV exports, plain
 * textareas — runs the value through here so tags never leak into it.
 * Plain-text input comes back unchanged.
 */
export function notesToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  if (!looksLikeHtml(value)) return value;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(p|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Every distinct crew note that applies to a visit, as plain text: the visit's
 * own note, the job's, and the property's standing note. Visit notes are often
 * a composed copy of the job note plus a service note, so a note already
 * contained in another is dropped rather than shown twice. This matches what
 * the crew app shows for a stop, so the board and the printed route sheet no
 * longer hide the property note ("dog loose") whenever a visit or job has one.
 */
export function visitCrewNoteBlocks(v: {
  notesToCrew?: string | null;
  job?: { notesToCrew?: string | null; propertyNotesToCrew?: string | null } | null;
}): string[] {
  const texts: string[] = [];
  for (const raw of [v.notesToCrew, v.job?.notesToCrew, v.job?.propertyNotesToCrew]) {
    const t = notesToPlainText(raw).trim();
    if (t && !texts.includes(t)) texts.push(t);
  }
  return texts.filter((t) => !texts.some((u) => u !== t && u.includes(t)));
}
