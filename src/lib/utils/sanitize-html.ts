// Minimal allowlist HTML sanitizer for rich-text authored inside the app
// (service descriptions, estimate line descriptions) that is rendered on
// client-facing pages via dangerouslySetInnerHTML.
//
// The source markup comes from Tiptap (RichTextEditor) so the vocabulary is
// small: paragraphs, lists, line breaks and inline emphasis. Everything else
// — including every attribute except a safe http(s)/mailto href on <a> and a
// text-align keyword on paragraphs/headings — is dropped. Pure string/regex
// based so it runs identically on the server and in the browser without a DOM
// dependency.

const ALLOWED_TAGS = new Set([
  "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "span", "a",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
]);

// Tags whose entire content (not just the tag) must be removed.
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
// Only matches a style attribute whose text-align value is one of these keywords.
const TEXT_ALIGN_RE = /\bstyle\s*=\s*(?:"[^"]*?|'[^']*?)\btext-align\s*:\s*(left|center|right|justify)\b/i;
const HREF_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

function safeHref(raw: string): string | null {
  const href = raw.trim().replace(/&amp;/g, "&");
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href.replace(/"/g, "%22");
  return null;
}

/** Returns true when the string contains something that parses as an HTML tag. */
export function looksLikeHtml(value: string | null | undefined): boolean {
  return !!value && /<\/?[a-z][^>]*>/i.test(value);
}

/**
 * Strip everything but a small allowlist of structural/inline tags. Text
 * content is left untouched (it is already entity-encoded by the editor);
 * we only rewrite tags.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  const withoutDangerous = html.replace(DROP_WITH_CONTENT, "");
  return withoutDangerous.replace(TAG_RE, (full, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    const closing = full.startsWith("</");
    if (closing) return `</${name}>`;
    if (name === "br") return "<br>";
    // The editor's alignment buttons write `style="text-align: center"` on
    // paragraphs. Every other attribute is dropped; this one survives only as
    // one of four exact keywords, re-emitted by us, so no author-controlled
    // CSS can come through.
    if (name === "p" || name === "h1" || name === "h2" || name === "h3" || name === "h4" || name === "h5" || name === "h6") {
      const align = TEXT_ALIGN_RE.exec(attrs ?? "");
      if (align) return `<${name} style="text-align:${align[1].toLowerCase()}">`;
    }
    if (name === "a") {
      const m = HREF_RE.exec(attrs ?? "");
      const href = m ? safeHref(m[2] ?? m[3] ?? m[4] ?? "") : null;
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${name}>`;
  });
}
