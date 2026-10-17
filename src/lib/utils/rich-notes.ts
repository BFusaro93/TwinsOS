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
