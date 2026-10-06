#!/usr/bin/env node
/**
 * Dark-mode codemod — makes hardcoded Tailwind colors theme-aware.
 *
 *   node scripts/dark-mode-codemod.mjs [--dry-run] [--verbose] <file|dir>...
 *
 * Light mode is left pixel-identical. Per color utility found in a string or
 * template literal it does ONE of:
 *
 *   1. Swap to a shadcn token ONLY where the token's light value is exactly
 *      the Tailwind color (see TOKEN_SWAPS — verified against globals.css):
 *        bg-white → bg-card, bg-slate-100 → bg-muted,
 *        border-slate-200 → border-border, text-slate-500 → text-muted-foreground
 *   2. Append a `dark:` counterpart (keeping any variant prefix, e.g.
 *      `hover:bg-green-50` → `hover:bg-green-50 dark:hover:bg-green-950/40`).
 *   3. Leave it alone — solid fills (bg-green-600), `text-white`, overlays —
 *      which read fine on dark.
 *
 * A file containing the comment `dark-mode-codemod: skip` is left alone
 * (use it for surfaces that are dark in both themes).
 *
 * A string containing the no-op class `dm-fixed-dark` gets no text/border
 * dark: pairs (for text on a surface that is dark in both themes).
 *
 * Idempotent: a class that already has a dark counterpart is skipped, so it
 * is safe to re-run. Anything the codemod can't decide (gradients, svg
 * fill/stroke, hex literals, inline style colors) is listed for manual review.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const targets = args.filter((a) => !a.startsWith("--"));
if (targets.length === 0) {
  console.error("usage: dark-mode-codemod.mjs [--dry-run] [--verbose] <file|dir>...");
  process.exit(1);
}

const NEUTRALS = ["slate", "gray", "zinc", "neutral", "stone"];
const CHROMATICS = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "brand",
];
const COLOR_RE = new RegExp(
  `^(bg|text|border|divide|ring)-((?:[trblxyse]-)?)(white|${[...NEUTRALS, ...CHROMATICS].join("|")})(?:-(\\d{2,3}))?(?:/(\\d{1,3}|\\[[^\\]]+\\]))?$`,
);
// Utilities we can't map mechanically — reported, not edited.
const MANUAL_RE = /^(?:[a-z-]+:)*(?:from|via|to|fill|stroke|placeholder|outline|decoration|shadow|accent|caret)-(?:white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|brand)(?:-\d{2,3})?(?:\/\d{1,3})?$/;

/** Exact light-value matches against the :root tokens in globals.css. */
const TOKEN_SWAPS = {
  "bg-white": "bg-card",
  "bg-slate-100": "bg-muted",
  "border-slate-200": "border-border",
  "divide-slate-200": "divide-border",
  "ring-slate-200": "ring-border",
  "text-slate-500": "text-muted-foreground",
};

/** Returns the util to append after `dark:<prefix>`, or null to leave alone. */
function darkUtil(kind, side, color, shade) {
  const k = side ? `${kind}-${side}` : kind;
  const isBorderish = kind === "border" || kind === "divide" || kind === "ring";
  if (color === "white") return kind === "bg" ? `${k}-card` : null;
  const n = Number(shade);
  if (NEUTRALS.includes(color)) {
    if (kind === "bg") {
      if (n === 50) return "bg-muted/40";
      if (n === 100) return "bg-muted";
      if (n === 200) return "bg-neutral-700";
      if (n === 300) return "bg-neutral-600";
      return null;
    }
    if (kind === "text") {
      if (n === 800 || n === 900) return "text-neutral-100";
      if (n === 700) return "text-neutral-300";
      if (n === 600 || n === 500) return "text-neutral-400";
      if (n === 400) return "text-neutral-500";
      if (n === 300) return "text-neutral-500";
      return null;
    }
    if (isBorderish) {
      if (n === 50 || n === 100) return `${k}-neutral-800`;
      if (n === 200) return `${k}-border`;
      if (n === 300) return `${k}-neutral-700`;
      if (n === 400) return `${k}-neutral-600`;
      return null;
    }
    return null;
  }
  // chromatic (incl. brand, which has no 950)
  const deep = color === "brand" ? 900 : 950;
  if (kind === "bg") {
    if (n === 50) return `bg-${color}-${deep}/${color === "brand" ? 30 : 40}`;
    if (n === 100) return `bg-${color}-900/40`;
    if (n === 200) return `bg-${color}-800/50`;
    if (n === 300) return `bg-${color}-700/50`;
    return null;
  }
  if (kind === "text") {
    if (n >= 500 && n <= 700) return `text-${color}-400`;
    if (n === 800) return `text-${color}-300`;
    if (n === 900) return `text-${color}-200`;
    return null;
  }
  if (isBorderish) {
    if (n === 50) return `${k}-${color}-900/60`;
    if (n === 100) return `${k}-${color}-900`;
    if (n === 200) return `${k}-${color}-800`;
    if (n === 300) return `${k}-${color}-700`;
    return null;
  }
  return null;
}

function isFixedDarkBg(tok) {
  const [prefix, util] = splitVariants(tok);
  if (prefix) return false;
  if (/^bg-(?:black|(?:slate|gray|zinc|neutral|stone)-(?:500|600|700|800|900|950))(?:\/\d+)?$/.test(util)) return !/\/\d/.test(util);
  if (/^bg-white\/(?:5|10|15|20|25|30)$/.test(util)) return true;
  const hex = /^bg-\[#([0-9a-fA-F]{6})\]$/.exec(util);
  if (!hex) return false;
  const n = parseInt(hex[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.4;
}

const stats = { files: 0, filesChanged: 0, swapped: 0, paired: 0, manual: [] };

/** Split `hover:md:bg-x` into prefix `hover:md:` and util `bg-x`. */
function splitVariants(token) {
  const i = token.lastIndexOf(":");
  return i === -1 ? ["", token] : [token.slice(0, i + 1), token.slice(i + 1)];
}

function kindKey(prefix, util) {
  // `bg-slate-50` → "bg"; `border-t-red-200` → "border-t"
  const m = /^(bg|text|border|divide|ring)-((?:[trblxyse]-)?)/.exec(util);
  return m ? `${prefix}${m[1]}${m[2] ? "-" + m[2].slice(0, -1) : ""}` : null;
}

function transformClassText(text, { startsTouch, endsTouch }, file, lineOf) {
  const tokens = [...text.matchAll(/\S+/g)];
  if (tokens.length === 0) return text;

  // Dark variants already present, as "<prefix><kind>" keys.
  const hasDark = new Set();
  for (const t of tokens) {
    if (!t[0].startsWith("dark:")) continue;
    const [prefix, util] = splitVariants(t[0].slice(5));
    const key = kindKey(prefix, util);
    if (key) hasDark.add(key);
  }

  // A surface that is dark in BOTH themes (bg-[#4a4a4a], bg-slate-800, bg-black…)
  // carries light text on purpose; flipping that text would make it vanish.
  // `text-slate-300 hover:text-white` is the filter-pill idiom on the fixed
  // dark-gray list toolbars: light text that brightens on hover.
  // Escape hatch that survives re-runs: add the no-op class `dm-fixed-dark`
  // to a string whose text sits on a surface that is dark in both themes.
  const fixedDark = tokens.some((t) => t[0] === "dm-fixed-dark") || tokens.some((t) => isFixedDarkBg(t[0])) || tokens.some((t) => t[0] === "hover:text-white");
  const pageShell = tokens.some((t) => /^(?:min-)?h-(?:dvh|screen)$/.test(t[0]));

  let out = "";
  let cursor = 0;
  tokens.forEach((m, idx) => {
    const tok = m[0];
    const touchesEdge = (idx === 0 && startsTouch) || (idx === tokens.length - 1 && endsTouch);
    out += text.slice(cursor, m.index);
    cursor = m.index + tok.length;
    if (touchesEdge || false || tok.startsWith("!") || tok.startsWith("dark:")) {
      out += tok;
      return;
    }
    const [prefix, util] = splitVariants(tok);
    if (prefix.includes("dark:")) { out += tok; return; }

    if (MANUAL_RE.test(tok)) {
      stats.manual.push(`${file}:${lineOf(m.index)}  ${tok}`);
      out += tok;
      return;
    }
    if (util.includes("[") && !/\/\[/.test(util)) { out += tok; return; }
    const cm = COLOR_RE.exec(util);
    if (!cm) { out += tok; return; }
    const [, kind, side, color, shade, alpha] = cm;
    const sideName = side ? side.slice(0, -1) : "";
    const key = kindKey(prefix, util);

    // bg-white / text-white without a shade: only bg-white has meaning here.
    if (color === "white" && kind !== "bg") { out += tok; return; }

    const baseUtil = `${kind}-${side}${color}${shade ? "-" + shade : ""}`;
    const swapTarget = TOKEN_SWAPS[baseUtil];
    let replacement = tok;
    let dark = null;

    // bg-white/5..30 is a highlight laid over a dark surface (sidebar rows,
    // toolbar buttons) — it must stay white, not become the dark card color.
    if (baseUtil === "bg-white" && alpha && Number(alpha) <= 30) { out += tok; return; }
    if (swapTarget && !sideName) {
      replacement = `${prefix}${swapTarget}${alpha ? "/" + alpha : ""}`;
      stats.swapped++;
      // Tokens already flip with `.dark` — no dark: class needed.
      out += replacement;
      return;
    }
    if (hasDark.has(key)) { out += tok; return; }
    let d = darkUtil(kind, sideName, color, shade);
    if (fixedDark && kind !== "bg") d = null;
    // A full-viewport wrapper is the page canvas, not a subtle surface tint.
    if (pageShell && baseUtil === "bg-slate-50" && !prefix) d = "bg-background";
    if (d) {
      // Carry the original alpha only when the mapping didn't pick its own.
      const withAlpha = alpha && !d.includes("/") ? `${d}/${alpha}` : d;
      dark = `dark:${prefix}${withAlpha}`;
    }
    if (dark) {
      stats.paired++;
      out += `${replacement} ${dark}`;
    } else {
      out += replacement;
    }
  });
  out += text.slice(cursor);
  return out;
}

function transformFile(file) {
  const src = fs.readFileSync(file, "utf8");
  // Opt-out for components that are a fixed dark surface in BOTH themes
  // (photo lightbox, annotation editor): put this comment anywhere in the file.
  if (src.includes("dark-mode-codemod: skip")) { stats.files++; return; }
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (offsetInSrc) => sf.getLineAndCharacterOfPosition(offsetInSrc).line + 1;
  const edits = [];

  const visit = (node) => {
    let range = null; // [innerStart, innerEnd, startsTouch, endsTouch]
    const s = node.getStart(sf);
    const e = node.getEnd();
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
        // Skip import/export specifiers and anything with escapes.
        if (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) break;
        if (src.slice(s, e).includes("\\")) break;
        range = [s + 1, e - 1, false, false];
        break;
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        range = [s + 1, e - 1, false, false]; break;
      case ts.SyntaxKind.TemplateHead:
        range = [s + 1, e - 2, false, true]; break;
      case ts.SyntaxKind.TemplateMiddle:
        range = [s + 1, e - 2, true, true]; break;
      case ts.SyntaxKind.TemplateTail:
        range = [s + 1, e - 1, true, false]; break;
    }
    if (range) {
      const [a, b, st, en] = range;
      const inner = src.slice(a, b);
      if (/(?:bg|text|border|divide|ring|from|via|to|fill|stroke)-/.test(inner)) {
        // startsTouch/endsTouch only matter when the text abuts `${}` with no space.
        const startsTouch = st && inner.length > 0 && !/^\s/.test(inner);
        const endsTouch = en && inner.length > 0 && !/\s$/.test(inner);
        const next = transformClassText(inner, { startsTouch, endsTouch }, file, (i) => lineOf(a + i));
        if (next !== inner) edits.push([a, b, next]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Hex literals and inline style colors → manual review (read-only).
  const hexOrStyle = /#[0-9a-fA-F]{3,8}\b|style=\{\{[^}]*(?:color|background)/g;
  for (const m of src.matchAll(hexOrStyle)) {
    stats.manual.push(`${file}:${lineOf(m.index)}  ${m[0].slice(0, 60)}`);
  }

  stats.files++;
  if (edits.length === 0) return;
  edits.sort((x, y) => y[0] - x[0]);
  let result = src;
  for (const [a, b, next] of edits) result = result.slice(0, a) + next + result.slice(b);
  stats.filesChanged++;
  if (VERBOSE) console.log(`${file}: ${edits.length} literal(s) rewritten`);
  if (!DRY) fs.writeFileSync(file, result);
}

function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) {
      if (f === "node_modules" || f.startsWith(".")) continue;
      walk(path.join(p, f));
    }
  } else if (/\.(tsx|ts)$/.test(p) && !p.endsWith(".d.ts")) {
    transformFile(p);
  }
}

targets.forEach(walk);
console.log(
  `${DRY ? "[dry-run] " : ""}${stats.files} files scanned, ${stats.filesChanged} changed — ` +
    `${stats.swapped} swapped to tokens, ${stats.paired} dark: pairs added`,
);
if (stats.manual.length) {
  console.log(`\nManual review (${stats.manual.length}):`);
  for (const line of stats.manual) console.log("  " + line);
}
