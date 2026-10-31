import { Fragment, createElement } from "react";
import { Text, View, Link, Image, StyleSheet } from "@react-pdf/renderer";
import { matchRichTextFont } from "@/lib/rich-text-fonts";
import type { Style } from "@react-pdf/types";

// ── Minimal HTML → react-pdf converter ───────────────────────────────────────
// Handles the constrained tag set produced by the Document Editor's Tiptap
// instance (see RichTextEditor.tsx: p, strong, em, u, ul, ol, li, br) plus
// <a> tags, which show up when a resolved merge tag injects an anchor
// (e.g. [quotelink], [formlink]). Not a general-purpose HTML parser.

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  href: string | null;
  color: string | null;
  background: string | null;
  fontSizePx: number | null;
  fontFamily: string | null; // react-pdf built-in family
  scale: number; // <sub>/<sup> shrink the run
}

interface Line {
  runs: Run[];
  listType: "ul" | "ol" | null;
  listIndex: number;
  align: "left" | "center" | "right" | "justify" | null;
  /** An empty paragraph (a blank line typed in the editor) — keeps one line of height. */
  blank?: boolean;
  /** An inline <img>; src is expected to already be a data URI (see sanitizeImageBlocks). */
  image?: { src: string; widthPt: number | null };
  rule?: boolean;
  indentPt?: number;
  table?: PdfCell[][];
}

interface PdfCell {
  header: boolean;
  colspan: number;
  lines: Line[];
}

// The editor renders at 14px (text-sm); sizes picked in the toolbar are scaled
// against that so they keep their proportion to the PDF's own base font size.
const EDITOR_BASE_PX = 14;

interface SpanStyle {
  color: string | null;
  background: string | null;
  fontSizePx: number | null;
  fontFamily: string | null;
}

function parseSpanStyle(attrs: string): SpanStyle {
  const out: SpanStyle = { color: null, background: null, fontSizePx: null, fontFamily: null };
  const m = attrs.match(/style\s*=\s*"([^"]*)"/i);
  if (!m) return out;
  for (const decl of m[1].replace(/&quot;/g, '"').split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop === "color") out.color = value;
    else if (prop === "background-color") out.background = value;
    else if (prop === "font-size") {
      const n = parseFloat(value);
      if (Number.isFinite(n) && n > 0) out.fontSizePx = n;
    } else if (prop === "font-family") out.fontFamily = matchRichTextFont(value)?.pdf ?? null;
  }
  return out;
}

const styles = StyleSheet.create({
  line: { marginBottom: 6 },
  listRow: { flexDirection: "row", marginBottom: 6 },
  bullet: { width: 14 },
  listText: { flex: 1 },
});

function tokenize(html: string): string[] {
  return html.split(/(<[^>]+>)/g).filter((t) => t.length > 0);
}

function parseTag(token: string): { name: string; closing: boolean; attrs: string } | null {
  const m = token.match(/^<\/?([a-zA-Z0-9]+)([^>]*)>$/);
  if (!m) return null;
  return { name: m[1].toLowerCase(), closing: token.startsWith("</"), attrs: m[2] ?? "" };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, "→");
}

function parseTable(tokens: string[]): PdfCell[][] {
  const rows: PdfCell[][] = [];
  let row: PdfCell[] | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const tag = parseTag(tokens[i]);
    if (!tag || tag.closing) continue;
    if (tag.name === "tr") {
      row = [];
      rows.push(row);
    } else if ((tag.name === "td" || tag.name === "th") && row) {
      let depth = 1;
      let end = i + 1;
      for (; end < tokens.length; end++) {
        const t = parseTag(tokens[end]);
        if (t?.name === "table") depth += t.closing ? -1 : 1;
        if (depth === 1 && t && t.closing && (t.name === "td" || t.name === "th")) break;
      }
      row.push({
        header: tag.name === "th",
        colspan: Number(tag.attrs.match(/colspan\s*=\s*"?(\d+)"?/i)?.[1] ?? 1) || 1,
        lines: parseLines(tokens.slice(i + 1, end).join("")),
      });
      i = end;
    }
  }
  return rows.filter((r) => r.length > 0);
}

/** Parses a constrained HTML fragment into an array of renderable lines. */
function parseLines(html: string): Line[] {
  const tokens = tokenize(html);
  const lines: Line[] = [];
  let currentLine: Line = { runs: [], listType: null, listIndex: 0, align: null };
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let strike = 0;
  let href: string | null = null;
  const spanStack: SpanStyle[] = [];
  const alignStack: Array<Line["align"]> = [];
  let paraEmpty = false;
  const emptySpan: SpanStyle = { color: null, background: null, fontSizePx: null, fontFamily: null };
  const activeSpan = () => spanStack[spanStack.length - 1] ?? emptySpan;
  const currentAlign = () => alignStack[alignStack.length - 1] ?? null;
  const indentStack: number[] = [];
  const currentIndent = () => indentStack[indentStack.length - 1] ?? 0;
  let scale = 1;
  const listStack: Array<"ul" | "ol"> = [];
  let listCounter = 0;

  function pushLineIfNonEmpty() {
    if (currentLine.runs.some((r) => r.text.trim().length > 0)) {
      currentLine.align = currentAlign();
      currentLine.indentPt = currentIndent();
      lines.push(currentLine);
      paraEmpty = false;
    }
    currentLine = { runs: [], listType: listStack[listStack.length - 1] ?? null, listIndex: listCounter, align: null };
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];
    const tag = parseTag(token);
    if (!tag) {
      const text = decodeEntities(token);
      if (text.length === 0) continue;
      if (text.trim().length > 0) paraEmpty = false;
      const span = activeSpan();
      currentLine.runs.push({
        text, bold: bold > 0, italic: italic > 0, underline: underline > 0, strike: strike > 0, href,
        color: span.color, background: span.background, fontSizePx: span.fontSizePx, fontFamily: span.fontFamily,
        scale,
      });
      continue;
    }

    switch (tag.name) {
      case "p":
      case "div":
        if (tag.closing) {
          pushLineIfNonEmpty();
          // <p></p> / <p><br></p> is a blank line the author typed; dropping it
          // collapsed their spacing in the PDF.
          if (paraEmpty && !listStack.length) {
            lines.push({ runs: [], listType: null, listIndex: 0, align: null, blank: true });
          }
          paraEmpty = false;
          alignStack.pop();
          indentStack.pop();
        } else {
          pushLineIfNonEmpty();
          paraEmpty = true;
          const al = tag.attrs.match(/text-align\s*:\s*(left|center|right|justify)/i);
          alignStack.push(al ? (al[1].toLowerCase() as Line["align"]) : null);
          const pad = tag.attrs.match(/padding-left\s*:\s*(\d{1,3})px/i);
          indentStack.push(pad ? Number(pad[1]) * 0.75 : 0);
        }
        break;
      case "span":
        if (tag.closing) spanStack.pop();
        else spanStack.push(parseSpanStyle(tag.attrs));
        break;
      case "sub":
      case "sup":
        scale = tag.closing ? 1 : 0.7;
        break;
      case "hr":
        pushLineIfNonEmpty();
        lines.push({ runs: [], listType: null, listIndex: 0, align: null, rule: true });
        break;
      case "table": {
        if (tag.closing) break;
        pushLineIfNonEmpty();
        let depth = 1;
        let end = ti + 1;
        for (; end < tokens.length; end++) {
          const t = parseTag(tokens[end]);
          if (t?.name === "table") depth += t.closing ? -1 : 1;
          if (depth === 0) break;
        }
        lines.push({ runs: [], listType: null, listIndex: 0, align: null, table: parseTable(tokens.slice(ti + 1, end)) });
        ti = end;
        break;
      }
      case "s":
      case "strike":
      case "del":
        strike += tag.closing ? -1 : 1;
        break;
      case "img": {
        const src = tag.attrs.match(/src\s*=\s*"([^"]*)"/i)?.[1];
        if (!src || !src.startsWith("data:image/")) break;
        pushLineIfNonEmpty();
        const w = tag.attrs.match(/width\s*=\s*"?(\d{1,4})"?/i)?.[1];
        lines.push({
          runs: [], listType: null, listIndex: 0, align: currentAlign(),
          image: { src, widthPt: w ? Number(w) * 0.75 : null },
        });
        paraEmpty = false;
        break;
      }
      case "br":
        pushLineIfNonEmpty();
        break;
      case "strong":
      case "b":
        bold += tag.closing ? -1 : 1;
        break;
      case "em":
      case "i":
        italic += tag.closing ? -1 : 1;
        break;
      case "u":
        underline += tag.closing ? -1 : 1;
        break;
      case "a": {
        if (tag.closing) {
          href = null;
        } else {
          const m = tag.attrs.match(/href="([^"]*)"/);
          href = m ? m[1] : null;
        }
        break;
      }
      case "ul":
      case "ol":
        if (tag.closing) {
          listStack.pop();
        } else {
          pushLineIfNonEmpty();
          listStack.push(tag.name);
          listCounter = 0;
        }
        break;
      case "li":
        if (!tag.closing) {
          pushLineIfNonEmpty();
          listCounter += 1;
          currentLine.listType = listStack[listStack.length - 1] ?? null;
          currentLine.listIndex = listCounter;
        } else {
          pushLineIfNonEmpty();
        }
        break;
      default:
        // Unknown tag — ignore, keep its inner text via subsequent text tokens.
        break;
    }
  }
  pushLineIfNonEmpty();

  return lines;
}

function runStyle(run: Run) {
  return {
    fontWeight: run.bold ? 700 : 400,
    fontStyle: run.italic ? "italic" as const : "normal" as const,
    textDecoration:
      run.underline || run.href ? ("underline" as const)
      : run.strike ? ("line-through" as const)
      : ("none" as const),
    color: run.href ? "#2563eb" : run.color ?? undefined,
    ...(run.background ? { backgroundColor: run.background } : {}),
    ...(run.fontFamily ? { fontFamily: run.fontFamily } : {}),
  };
}

/**
 * Converts a constrained HTML string (from the Document Editor's rich text
 * blocks) into react-pdf elements. `baseStyle` is applied to each text line
 * (e.g. for header/paragraph font sizing).
 */
export function htmlToPdfNodes(html: string, baseStyle: Style = {}) {
  if (!html || !html.trim()) return null;
  const lines = parseLines(html);
  if (lines.length === 0) return null;
  return createElement(Fragment, null, renderLines(lines, baseStyle));
}

function renderLines(lines: Line[], baseStyle: Style): ReturnType<typeof createElement>[] {
  return lines.map((line, i) => {
    if (line.rule) {
      return createElement(View, { key: i, style: { borderBottomWidth: 1, borderBottomColor: "#cbd5e1", marginVertical: 6 } });
    }
    if (line.table) {
      return createElement(
        View,
        { key: i, style: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#cbd5e1", marginBottom: 6 } },
        line.table.map((row, r) => {
          const total = row.reduce((n, c) => n + c.colspan, 0) || 1;
          return createElement(
            View,
            { key: r, style: { flexDirection: "row" }, wrap: false },
            row.map((cell, c) =>
              createElement(
                View,
                {
                  key: c,
                  style: {
                    flex: cell.colspan / total,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: "#cbd5e1",
                    padding: 4,
                    ...(cell.header ? { backgroundColor: "#f1f5f9" } : {}),
                  },
                },
                renderLines(cell.lines, cell.header ? { ...baseStyle, fontWeight: 700 } : baseStyle)
              )
            )
          );
        })
      );
    }
    if (line.image) {
      return createElement(
        View,
        { key: i, style: { marginBottom: 6, alignItems: line.align === "center" ? "center" : line.align === "right" ? "flex-end" : "flex-start" } },
        createElement(Image, { src: line.image.src, style: { maxWidth: "100%", ...(line.image.widthPt ? { width: line.image.widthPt } : {}) } })
      );
    }
    if (line.blank) {
      return createElement(Text, { key: i, style: [baseStyle, styles.line] }, "\u00A0");
    }
    const baseSize = typeof baseStyle.fontSize === "number" ? baseStyle.fontSize : 9;
    const textRuns = line.runs.map((run, j) => {
      const size = run.fontSizePx ? (baseSize * run.fontSizePx) / EDITOR_BASE_PX : baseSize;
      const style = { ...baseStyle, ...runStyle(run), fontSize: size * run.scale };
      return run.href
        ? createElement(Link, { key: j, src: run.href, style }, run.text)
        : createElement(Text, { key: j, style }, run.text);
    });
    const textAlign = line.align ? { textAlign: line.align } : {};
    const indent = line.indentPt ? { marginLeft: line.indentPt } : {};

    if (line.listType) {
      const bullet = line.listType === "ul" ? "•" : `${line.listIndex}.`;
      return createElement(
        View,
        { key: i, style: [styles.listRow, indent] },
        createElement(Text, { style: [baseStyle, styles.bullet] }, bullet),
        createElement(Text, { style: [baseStyle, styles.listText, textAlign] }, textRuns)
      );
    }

    return createElement(Text, { key: i, style: [styles.line, textAlign, indent] }, textRuns);
  });
}
