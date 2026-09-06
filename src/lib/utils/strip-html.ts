// Block-level closers / hard breaks become line breaks so adjacent blocks do
// not run together: "<p>Mulch</p><ul><li><p>x yards</p></li></ul>" used to
// flatten to "Mulchx yards"; it now becomes "Mulch\nx yards".
const BLOCK_BREAK_RE = /<br\s*\/?>|<\/(p|div|li|ul|ol|h[1-6]|blockquote|tr|table)\s*>/gi;
const TAG_RE = /<[^>]+>/g;

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * Convert an HTML fragment to plain text, keeping one line break between
 * block elements and collapsing runs of blank lines.
 */
export function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(BLOCK_BREAK_RE, "\n")
      .replace(TAG_RE, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
