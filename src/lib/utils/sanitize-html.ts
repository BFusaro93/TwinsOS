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

import { matchRichTextFont } from "@/lib/rich-text-fonts";

const ALLOWED_TAGS = new Set([
  "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "span", "a",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "img", "strike", "del", "mark",
  "sub", "sup", "hr", "table", "thead", "tbody", "tr", "th", "td",
]);

// Tags whose entire content (not just the tag) must be removed.
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
// Only matches a style attribute whose text-align value is one of these keywords.
const TEXT_ALIGN_RE = /\bstyle\s*=\s*(?:"[^"]*?|'[^']*?)\btext-align\s*:\s*(left|center|right|justify)\b/i;
const COLOR_VALUE_RE = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;
const FONT_SIZE_RE = /^(\d{1,2})(?:\.\d+)?px$/i;
export const TABLE_STYLE = "border-collapse:collapse;width:100%";
export const TD_STYLE = "border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top";
export const TH_STYLE = `${TD_STYLE};background:#f1f5f9;font-weight:600;text-align:left`;
const STYLE_ATTR_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * The editor's text-style span (colour, highlight, size, font). Each declaration
 * is validated on its own and re-emitted by us, so no author-controlled CSS
 * survives beyond these four properties.
 */
function safeSpanStyle(attrs: string): string {
  const m = STYLE_ATTR_RE.exec(attrs);
  if (!m) return "";
  const out: string[] = [];
  for (const decl of (m[1] ?? m[2] ?? "").replace(/&quot;/g, '"').split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if ((prop === "color" || prop === "background-color") && COLOR_VALUE_RE.test(value)) {
      out.push(`${prop}:${value.toLowerCase().replace(/\s+/g, "")}`);
    } else if (prop === "font-size") {
      const sz = FONT_SIZE_RE.exec(value);
      if (sz && Number(sz[1]) >= 8 && Number(sz[1]) <= 72) out.push(`font-size:${value.toLowerCase()}`);
    } else if (prop === "font-family") {
      const font = matchRichTextFont(value);
      if (font) out.push(`font-family:${font.css.replace(/'/g, "")}`);
    }
  }
  return out.join(";");
}
const SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const DIM_RE = (name: string) => new RegExp(`\\b${name}\\s*=\\s*"?(\\d{1,4})"?`, "i");
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
      const pad = /padding-left\s*:\s*(\d{1,3})px/i.exec(attrs ?? "");
      const decls = [
        ...(align ? [`text-align:${align[1].toLowerCase()}`] : []),
        ...(pad && Number(pad[1]) <= 144 ? [`padding-left:${Number(pad[1])}px`] : []),
      ];
      if (decls.length) return `<${name} style="${decls.join(";")}">`;
    }
    if (name === "table") return `<table style="${TABLE_STYLE}">`;
    if (name === "th" || name === "td") {
      const span = (attr: string) => {
        const m = new RegExp(`\\b${attr}\\s*=\\s*"?(\\d{1,2})"?`, "i").exec(attrs ?? "");
        return m && Number(m[1]) > 1 ? ` ${attr}="${Number(m[1])}"` : "";
      };
      return `<${name}${span("colspan")}${span("rowspan")} style="${name === "th" ? TH_STYLE : TD_STYLE}">`;
    }
    if (name === "span") {
      const style = safeSpanStyle(attrs ?? "");
      if (style) return `<span style="${style}">`;
    }
    if (name === "img") {
      // Only https images (the editor uploads to public storage); size is
      // re-emitted as plain integers so no author-controlled CSS survives.
      const m = SRC_RE.exec(attrs ?? "");
      const src = m ? (m[1] ?? m[2] ?? "").trim().replace(/&amp;/g, "&") : "";
      if (!/^https:\/\//i.test(src)) return "";
      const w = DIM_RE("width").exec(attrs ?? "");
      const h = DIM_RE("height").exec(attrs ?? "");
      return `<img src="${src.replace(/"/g, "%22")}"${w ? ` width="${w[1]}"` : ""}${h ? ` height="${h[1]}"` : ""} style="max-width:100%;height:auto" alt="">`;
    }
    if (name === "a") {
      const m = HREF_RE.exec(attrs ?? "");
      const href = m ? safeHref(m[2] ?? m[3] ?? m[4] ?? "") : null;
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${name}>`;
  });
}
