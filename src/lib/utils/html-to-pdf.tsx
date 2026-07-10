import { Fragment, createElement } from "react";
import { Text, View, Link, StyleSheet } from "@react-pdf/renderer";
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
  href: string | null;
}

interface Line {
  runs: Run[];
  listType: "ul" | "ol" | null;
  listIndex: number;
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

/** Parses a constrained HTML fragment into an array of renderable lines. */
function parseLines(html: string): Line[] {
  const tokens = tokenize(html);
  const lines: Line[] = [];
  let currentLine: Line = { runs: [], listType: null, listIndex: 0 };
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let href: string | null = null;
  const listStack: Array<"ul" | "ol"> = [];
  let listCounter = 0;

  function pushLineIfNonEmpty() {
    if (currentLine.runs.some((r) => r.text.trim().length > 0)) {
      lines.push(currentLine);
    }
    currentLine = { runs: [], listType: listStack[listStack.length - 1] ?? null, listIndex: listCounter };
  }

  for (const token of tokens) {
    const tag = parseTag(token);
    if (!tag) {
      const text = decodeEntities(token);
      if (text.length === 0) continue;
      currentLine.runs.push({ text, bold: bold > 0, italic: italic > 0, underline: underline > 0, href });
      continue;
    }

    switch (tag.name) {
      case "p":
      case "div":
        if (tag.closing) pushLineIfNonEmpty();
        break;
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
    textDecoration: run.underline || run.href ? "underline" as const : "none" as const,
    color: run.href ? "#2563eb" : undefined,
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

  return createElement(
    Fragment,
    null,
    lines.map((line, i) => {
      const textRuns = line.runs.map((run, j) =>
        run.href
          ? createElement(Link, { key: j, src: run.href, style: { ...baseStyle, ...runStyle(run) } }, run.text)
          : createElement(Text, { key: j, style: { ...baseStyle, ...runStyle(run) } }, run.text)
      );

      if (line.listType) {
        const bullet = line.listType === "ul" ? "•" : `${line.listIndex}.`;
        return createElement(
          View,
          { key: i, style: styles.listRow },
          createElement(Text, { style: [baseStyle, styles.bullet] }, bullet),
          createElement(Text, { style: [baseStyle, styles.listText] }, textRuns)
        );
      }

      return createElement(Text, { key: i, style: styles.line }, textRuns);
    })
  );
}
