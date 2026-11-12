#!/usr/bin/env node
// Guard: every permission key in the catalog (src/types/crm-roles.ts) must be in
// the default CRM role templates (crm_default_role_templates(), newest migration
// that defines it). Owner and Operations Manager hold the whole catalog, so a new
// key that only got a one-time backfill would otherwise silently miss every org
// created after that backfill ran.
//
// Run: npm run check:role-templates (also part of `npm run lint`).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── catalog keys ─────────────────────────────────────────────────────────────
const catalogSrc = readFileSync(join(root, "src/types/crm-roles.ts"), "utf8");
const start = catalogSrc.indexOf("export const PERMISSION_TABS");
const end = catalogSrc.indexOf("\n};", start);
const block = catalogSrc.slice(start, end);
const catalog = new Set();
for (const m of block.matchAll(/^\s+([a-z][a-z0-9_]*):\s*"/gm)) {
  if (m[1] !== "label") catalog.add(m[1]);
}

// ── template (newest migration that defines the function) ────────────────────
const migDir = join(root, "supabase/migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
let latest = null;
for (const f of files) {
  const sql = readFileSync(join(migDir, f), "utf8");
  if (/function\s+public\.crm_default_role_templates\s*\(/i.test(sql)) latest = { f, sql };
}
if (!latest) {
  process.stderr.write("check-role-templates: no migration defines crm_default_role_templates()\n");
  process.exit(1);
}

function templateKeys(roleName) {
  const re = new RegExp(`\\('${roleName.replace(/[/]/g, "\\/")}',\\s*'[^']*',\\s*'(\\{[^']*\\})'::jsonb\\)`);
  const m = latest.sql.match(re);
  if (!m) return null;
  return new Set(Object.keys(JSON.parse(m[1])));
}

let failed = false;
for (const role of ["Owner", "Operations Manager"]) {
  const keys = templateKeys(role);
  if (!keys) {
    process.stderr.write(`check-role-templates: ${role} template not found in ${latest.f}\n`);
    failed = true;
    continue;
  }
  const missing = [...catalog].filter((k) => !keys.has(k));
  const unknown = [...keys].filter((k) => !catalog.has(k));
  if (missing.length) {
    failed = true;
    process.stderr.write(
      `check-role-templates: ${role} template (${latest.f}) is missing catalog keys: ${missing.join(", ")}\n`,
    );
  }
  if (unknown.length) {
    failed = true;
    process.stderr.write(
      `check-role-templates: ${role} template (${latest.f}) has keys not in the catalog: ${unknown.join(", ")}\n`,
    );
  }
}

if (failed) {
  process.stderr.write(
    "Add new permission keys to crm_default_role_templates() in a new migration (and backfill existing default roles additively).\n",
  );
  process.exit(1);
}
process.stdout.write(`check-role-templates: OK (${catalog.size} catalog keys, template ${latest.f})\n`);
