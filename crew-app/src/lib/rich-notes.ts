// Port of notesToPlainText() (src/lib/utils/rich-notes.ts in the web app).
// Job notes are authored in a rich-text editor and stored as an HTML fragment,
// but older rows are plain strings. React Native can't render markup, so every
// notes-to-crew value goes through this before display. Keep in step with the
// web helper — the server's push preview already uses the web one.

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value);
}

export function notesToPlainText(value: string | null | undefined): string {
  if (!value) return '';
  if (!looksLikeHtml(value)) return value;
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(p|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
