/**
 * build-data-dictionary.mjs
 *
 * The Report Center's prebuilt report definitions
 * (src/lib/reports/definitions/*.ts) already hand-pair raw DB/view column
 * names with human-readable descriptions and business-logic caveats (the
 * `notes` field) — e.g. chemical-reports.ts explaining exactly when
 * `applicator_license_number` populates. That makes them the best available
 * source for a "data dictionary" the Ask AI support widget can cite when
 * answering "is X actually tracked" questions, better than the undocumented,
 * description-free src/types/supabase.ts.
 *
 * This script statically parses each definitions file with the TypeScript
 * compiler's AST (no execution — several files' `run()` handlers import and
 * call the Supabase client, which we never want to invoke from a build
 * script) and extracts, per report entry: key, section, name, description,
 * notes, and — where the report uses the declarative `analysis()` shape —
 * the resulting `dataset` and `columns` array.
 *
 * Usage:
 *   node scripts/build-data-dictionary.mjs
 *
 * Re-run this after adding or editing a report definition — nothing
 * regenerates it automatically.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DEFINITIONS_DIR = join(REPO_ROOT, "src/lib/reports/definitions");
const OUT_FILE = join(REPO_ROOT, "src/lib/data-dictionary.json");

/** Evaluates a limited set of literal expression shapes without executing code. */
function literalValue(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(literalValue).filter((v) => v !== undefined);
  }
  return undefined;
}

/** Finds the first property with the given name on an object literal, if present. */
function findProp(objectLiteral, name) {
  return objectLiteral.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name && p.name.getText() === name
  );
}

/**
 * Given the object literal for one PrebuiltReportDef entry, extracts the
 * fields we care about. `analysis` is a function whose body returns an
 * object literal — we walk into it looking for a top-level return statement
 * with `dataset`/`columns` properties, without ever calling the function.
 */
function extractEntry(objectLiteral) {
  const entry = {};

  const key = findProp(objectLiteral, "key");
  if (key) entry.key = literalValue(key.initializer);

  const section = findProp(objectLiteral, "section");
  if (section) entry.section = literalValue(section.initializer);

  const name = findProp(objectLiteral, "name");
  if (name) entry.name = literalValue(name.initializer);

  const description = findProp(objectLiteral, "description");
  if (description) entry.description = literalValue(description.initializer);

  const notes = findProp(objectLiteral, "notes");
  if (notes) entry.notes = literalValue(notes.initializer);

  const analysis = findProp(objectLiteral, "analysis");
  if (analysis && analysis.initializer) {
    const fn = analysis.initializer;
    const body = ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) ? fn.body : null;
    let returnedObject = null;

    if (body && ts.isParenthesizedExpression(body)) {
      returnedObject = ts.isObjectLiteralExpression(body.expression) ? body.expression : null;
    } else if (body && ts.isObjectLiteralExpression(body)) {
      returnedObject = body;
    } else if (body && ts.isBlock(body)) {
      for (const stmt of body.statements) {
        if (ts.isReturnStatement(stmt) && stmt.expression) {
          const expr = ts.isParenthesizedExpression(stmt.expression)
            ? stmt.expression.expression
            : stmt.expression;
          if (ts.isObjectLiteralExpression(expr)) {
            returnedObject = expr;
            break;
          }
        }
      }
    }

    if (returnedObject) {
      const dataset = findProp(returnedObject, "dataset");
      if (dataset) entry.dataset = literalValue(dataset.initializer);
      const columns = findProp(returnedObject, "columns");
      if (columns) entry.columns = literalValue(columns.initializer);
    }
  }

  return entry;
}

function extractFile(sourceFile) {
  const entries = [];

  function visit(node) {
    // Every definitions file exports one `const X_REPORTS: PrebuiltReportDef[] = [ {...}, {...} ]`.
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (ts.isObjectLiteralExpression(el)) {
          const entry = extractEntry(el);
          if (entry.key) entries.push(entry);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return entries;
}

function main() {
  const files = readdirSync(DEFINITIONS_DIR).filter((f) => f.endsWith(".ts"));

  const dictionary = [];
  for (const file of files) {
    const filePath = join(DEFINITIONS_DIR, file);
    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    dictionary.push(...extractFile(sourceFile));
  }

  writeFileSync(OUT_FILE, JSON.stringify(dictionary, null, 2) + "\n");
  console.log(`Wrote ${dictionary.length} data dictionary entries to ${OUT_FILE}`);
}

main();
