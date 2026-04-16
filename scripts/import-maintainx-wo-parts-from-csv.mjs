/**
 * import-maintainx-wo-parts-from-csv.mjs
 *
 * Reads a MaintainX "Part Transactions" CSV export, extracts all parts
 * consumed on Work Orders (Direction=OUT, Work Order URL present), fetches
 * each unique MX WO title via the API, matches to Equipt WOs by
 * title + asset_name, and inserts wo_parts records.
 *
 * IMPORTANT: Does NOT touch parts.quantity_on_hand — purely associative.
 *
 * Usage:
 *   MX_TOKEN=eyJ... \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   ORG_ID=619de9bb-... \
 *   CSV_PATH=/Users/.../Part\ Transactions\ -\ ....csv \
 *   node scripts/import-maintainx-wo-parts-from-csv.mjs
 *
 * Optional: DRY_RUN=true
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const MX_TOKEN             = process.env.MX_TOKEN;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID               = process.env.ORG_ID;
const DRY_RUN              = process.env.DRY_RUN === "true";
const CSV_PATH             = process.env.CSV_PATH;
const MX_BASE              = "https://api.getmaintainx.com/v1";

if (!MX_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID || !CSV_PATH) {
  console.error("Missing required env vars: MX_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID, CSV_PATH");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function normalize(s) {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mxGet(path, retries = 6) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${MX_BASE}${path}`, {
      headers: { Authorization: `Bearer ${MX_TOKEN}` },
    });
    if (res.status === 429) {
      const wait = 5000 * 2 ** attempt;
      console.log(`    ⏳  Rate limited — waiting ${(wait / 1000).toFixed(0)}s`);
      if (attempt < retries) { await sleep(wait); continue; }
    }
    if (!res.ok) throw new Error(`MX API ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

// ── Parse CSV (handles quoted fields with commas and newlines) ─────────────
function parseCSV(text) {
  // Strip BOM if present
  const content = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\n') {
        row.push(field); field = "";
        rows.push(row); row = [];
      } else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// Extract MX WO internal ID from the Work Order URL
function extractMxWOId(url) {
  const match = url?.match(/workorders\/(\d+)/);
  return match ? match[1] : null;
}

async function run() {
  console.log(`\n🔗  MaintainX CSV → Equipt WO parts import`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes\n");

  // ── 1. Parse CSV ──────────────────────────────────────────────────────────
  console.log(`📄  Reading CSV: ${CSV_PATH}`);
  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parseCSV(raw);
  console.log(`    ${rows.length} rows parsed`);

  // Filter: OUT transactions linked to a WO
  const woRows = rows.filter(
    (r) => r["Direction"] === "OUT" && r["Work Order URL"]?.includes("workorders/")
  );
  console.log(`    ${woRows.length} OUT rows with WO links\n`);

  // Build: mxWOId → { qty by partNumber/partName, asset } (net per WO+part)
  // Key: mxWOId:partNumber (or mxWOId:partName if no number)
  const woPartMap = new Map(); // key → { mxWOId, partNumber, partName, mxAssetName, qty, unitCostCents }

  for (const r of woRows) {
    const mxWOId = extractMxWOId(r["Work Order URL"]);
    if (!mxWOId) continue;

    const partNumber  = normalize(r["Part Number"]);
    const partName    = normalize(r["Part Name"]);
    const qty         = Math.abs(parseInt(r["Quantity Added to Inventory"], 10) || 1);
    const unitCost    = Math.round(parseFloat(r["Unit Cost"] || "0") * 100); // cents
    const mxAsset     = r["Work Order Asset"]?.trim() ?? "";
    const key         = `${mxWOId}:${partNumber || partName}`;

    if (!woPartMap.has(key)) {
      woPartMap.set(key, { mxWOId, partNumber, partName, mxAssetName: mxAsset, qty: 0, unitCostCents: unitCost });
    }
    woPartMap.get(key).qty += qty;
  }

  // Get unique MX WO IDs
  const uniqueMxWOIds = [...new Set([...woPartMap.values()].map((v) => v.mxWOId))];
  console.log(`    ${woPartMap.size} unique WO+part combinations across ${uniqueMxWOIds.length} WOs\n`);

  // ── 2. Fetch MX WO titles ─────────────────────────────────────────────────
  console.log(`📥  Fetching ${uniqueMxWOIds.length} MaintainX WO titles…`);
  const mxWOTitleMap = new Map(); // mxWOId → { title, assetName }

  for (let i = 0; i < uniqueMxWOIds.length; i++) {
    const id = uniqueMxWOIds[i];
    try {
      const data = await mxGet(`/workorders/${id}`);
      const wo = data.workOrder ?? data;
      mxWOTitleMap.set(id, { title: normalize(wo.title ?? ""), rawTitle: wo.title });
    } catch (e) {
      console.log(`  ⚠️  Failed to fetch MX WO ${id}: ${e.message}`);
    }
    await sleep(300);
    if ((i + 1) % 20 === 0) console.log(`    … ${i + 1}/${uniqueMxWOIds.length}`);
  }
  console.log(`    Done — ${mxWOTitleMap.size} titles fetched\n`);

  // ── 3. Load Equipt WOs ────────────────────────────────────────────────────
  console.log("📥  Loading Equipt work orders…");
  const { data: equipWOs, error: woErr } = await supabase
    .from("work_orders")
    .select("id, work_order_number, title, asset_name, status")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (woErr) { console.error("Failed:", woErr.message); process.exit(1); }

  // Build lookup: normalized title → array of WOs (multiple WOs can share a title)
  const equipWOsByTitle = new Map();
  for (const wo of equipWOs) {
    const key = normalize(wo.title);
    if (!equipWOsByTitle.has(key)) equipWOsByTitle.set(key, []);
    equipWOsByTitle.get(key).push(wo);
  }
  console.log(`    ${equipWOs.length} WOs loaded\n`);

  // ── 4. Load Equipt parts ──────────────────────────────────────────────────
  console.log("📥  Loading Equipt parts…");
  const { data: equipParts, error: partsErr } = await supabase
    .from("parts")
    .select("id, part_number, name, unit_cost")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (partsErr) { console.error("Failed:", partsErr.message); process.exit(1); }

  const equipPartByNumber = new Map(
    equipParts.filter((p) => p.part_number).map((p) => [normalize(p.part_number), p])
  );
  const equipPartByName = new Map(equipParts.map((p) => [normalize(p.name), p]));
  console.log(`    ${equipParts.length} parts loaded\n`);

  // ── 5. Load existing wo_parts ─────────────────────────────────────────────
  const { data: existing } = await supabase
    .from("wo_parts")
    .select("work_order_id, part_id")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  const existingSet = new Set((existing ?? []).map((r) => `${r.work_order_id}:${r.part_id}`));

  // ── 6. Match and build insert rows ────────────────────────────────────────
  console.log("🔍  Matching WOs and parts…\n");
  const toInsert = [];
  let noWOTitle = 0, noWOMatch = 0, multiWOMatch = 0, noPartMatch = 0, alreadyLinked = 0;

  for (const [, entry] of woPartMap) {
    const { mxWOId, partNumber, partName, mxAssetName, qty, unitCostCents } = entry;

    // Get MX WO title
    const mxWO = mxWOTitleMap.get(mxWOId);
    if (!mxWO) { noWOTitle++; continue; }

    // Match Equipt WO by title
    const candidates = equipWOsByTitle.get(mxWO.title) ?? [];
    let equipWO = null;

    if (candidates.length === 0) {
      console.log(`  ⚠️  No WO match for title: "${mxWO.rawTitle}" (MX:${mxWOId})`);
      noWOMatch++;
      continue;
    } else if (candidates.length === 1) {
      equipWO = candidates[0];
    } else {
      // Multiple WOs with same title — narrow by asset name
      const assetMatch = candidates.find(
        (w) => normalize(w.asset_name) === normalize(mxAssetName)
      );
      if (assetMatch) {
        equipWO = assetMatch;
      } else {
        // Take most recent one as best guess
        equipWO = candidates[candidates.length - 1];
        multiWOMatch++;
        console.log(`  ⚠️  Multiple WOs for "${mxWO.rawTitle}" — used asset match heuristic`);
      }
    }

    // Match part
    let equipPart = partNumber ? equipPartByNumber.get(partNumber) : null;
    if (!equipPart) equipPart = equipPartByName.get(partName);
    if (!equipPart) {
      console.log(`  ⚠️  No part match: "${partName}" (${partNumber}) — skipping`);
      noPartMatch++;
      continue;
    }

    const key = `${equipWO.id}:${equipPart.id}`;
    if (existingSet.has(key)) { alreadyLinked++; continue; }

    toInsert.push({
      org_id:        ORG_ID,
      work_order_id: equipWO.id,
      part_id:       equipPart.id,
      part_name:     equipPart.name,
      part_number:   equipPart.part_number ?? "",
      quantity:      qty,
      unit_cost:     unitCostCents || equipPart.unit_cost || 0,
    });
    existingSet.add(key);

    console.log(`  ✓  "${mxWO.rawTitle?.slice(0, 28)}"  ↔  "${equipPart.name?.slice(0, 28)}" ×${qty}`);
  }

  // ── 7. Insert ─────────────────────────────────────────────────────────────
  let inserted = 0;
  if (!DRY_RUN && toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase
        .from("wo_parts")
        .upsert(batch, { onConflict: "work_order_id,part_id", ignoreDuplicates: true });
      if (error) console.error(`  ❌  Insert error: ${error.message}`);
      else inserted += batch.length;
    }
  } else {
    inserted = toInsert.length;
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WO+part combinations    : ${woPartMap.size}
  Links to insert         : ${toInsert.length}
  Inserted                : ${inserted}
  Already linked (skipped): ${alreadyLinked}
  No WO title from API    : ${noWOTitle}
  No WO match in Equipt   : ${noWOMatch}
  Multi-match (heuristic) : ${multiWOMatch}
  No part match           : ${noPartMatch}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN — re-run without DRY_RUN=true to apply." : ""}
`);
}

run().catch((e) => { console.error(e); process.exit(1); });
