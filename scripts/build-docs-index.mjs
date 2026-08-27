/**
 * build-docs-index.mjs
 *
 * The 30+ long-form guides under
 * src/app/(settings)/settings/support/(guides)/*-guide/page.tsx are freeform
 * JSX/TSX prose, not structured data — there's nothing for a search tool
 * (e.g. the MCP search_docs tool, src/app/api/mcp/tools.ts) to query.
 *
 * This script statically parses each guide's page.tsx with the TypeScript
 * compiler's AST (no execution, no next/font — "use client" components in
 * this tree pull in next/font/google, which only works inside Next's own
 * webpack build, so we never import/render the component) and pulls out
 * every JSX text node and string literal into one plain-text blob per slug.
 * The result is a static JSON index, committed to the repo, that a runtime
 * search can grep cheaply without bundling 30+ React components into the
 * MCP serverless function.
 *
 * Usage:
 *   node scripts/build-docs-index.mjs
 *
 * Re-run this after adding or editing a guide page — nothing regenerates it
 * automatically.
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const GUIDES_DIR = join(REPO_ROOT, "src/app/(settings)/settings/support/(guides)");
const OUT_FILE = join(REPO_ROOT, "src/lib/docs-guides-content.json");

const ENTITY_MAP = {
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&mdash;": "—",
  "&ndash;": "–",
  "&amp;": "&",
  "&nbsp;": " ",
  "&gt;": ">",
  "&lt;": "<",
};

function decodeEntities(text) {
  return text.replace(/&[a-z]+;/g, (m) => ENTITY_MAP[m] ?? m);
}

/** Collects every JsxText node and every string literal (skipping import paths and JSX attribute names like className/href) from a TSX source file. */
function extractText(sourceFile) {
  const parts = [];

  function visit(node) {
    if (ts.isImportDeclaration(node)) return; // skip import paths entirely

    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !ts.isImportSpecifier(node.parent)
    ) {
      // Skip obvious non-prose string literals: URLs/hrefs/ids/classNames.
      const parent = node.parent;
      const attrName =
        parent && ts.isJsxAttribute(parent) ? parent.name.getText(sourceFile) : null;
      if (attrName && ["href", "id", "className", "key"].includes(attrName)) return;
      const text = node.text.trim();
      if (text && text.length > 1 && !/^[a-z0-9-]+$/.test(text)) parts.push(text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return decodeEntities(parts.join(" ")).replace(/\s+/g, " ").trim();
}

function main() {
  const entries = readdirSync(GUIDES_DIR).filter((name) => {
    const full = join(GUIDES_DIR, name);
    return statSync(full).isDirectory();
  });

  const index = {};
  for (const slug of entries) {
    const pagePath = join(GUIDES_DIR, slug, "page.tsx");
    let source;
    try {
      source = readFileSync(pagePath, "utf8");
    } catch {
      continue; // no page.tsx in this dir, skip
    }
    const sourceFile = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    index[slug] = extractText(sourceFile);
  }

  writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(index).length} guides to ${OUT_FILE}`);
}

main();
