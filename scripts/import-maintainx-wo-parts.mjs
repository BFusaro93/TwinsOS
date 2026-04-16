/**
 * import-maintainx-wo-parts.mjs
 *
 * Fetches all MaintainX work orders, reads their parts, matches each WO to
 * an Equipt work order via the numeric middle segment of work_order_number
 * (e.g. "WO-014829-zpx" → MaintainX WO id 14829), matches parts by vendor
 * part number then name, and inserts wo_parts records.
 *
 * NOTE: This script NEVER touches parts.quantity_on_hand — it only creates
 * the wo_parts association records for cost/history tracking.
 *
 * Usage:
 *   MX_TOKEN=eyJ... \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   ORG_ID=619de9bb-... \
 *   node scripts/import-maintainx-wo-parts.mjs
 *
 * Optional: DRY_RUN=true
 */

import { createClient } from "@supabase/supabase-js";

const MX_TOKEN             = process.env.MX_TOKEN;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID               = process.env.ORG_ID;
const DRY_RUN              = process.env.DRY_RUN === "true";
const MX_BASE              = "https://api.getmaintainx.com/v1";

if (!MX_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID) {
  console.error("Missing required env vars: MX_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID");
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
      console.log(`    ⏳  Rate limited — waiting ${(wait / 1000).toFixed(0)}s (attempt ${attempt + 1}/${retries})`);
      if (attempt < retries) { await sleep(wait); continue; }
    }
    if (!res.ok) throw new Error(`MaintainX API ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

const DELAY_MS = 300;

async function fetchAllPages(listKey, path) {
  const items = [];
  let cursor = null;
  do {
    const url = cursor ? `${path}&cursor=${cursor}` : path;
    const data = await mxGet(url);
    items.push(...(data[listKey] ?? []));
    cursor = data.nextCursor ?? null;
    if (cursor) await sleep(DELAY_MS);
  } while (cursor);
  return items;
}

/**
 * Extract the MaintainX WO number from an Equipt work_order_number.
 * Format: "WO-014829-zpx" → 14829
 */
function extractMxId(woNumber) {
  const match = woNumber?.match(/^WO-0*(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

async function run() {
  console.log(`\n🔗  MaintainX → Equipt WO parts import`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes\n");

  // ── 1. Load Equipt work orders ────────────────────────────────────────────
  console.log("📥  Loading Equipt work orders…");
  const { data: equipWOs, error: woErr } = await supabase
    .from("work_orders")
    .select("id, work_order_number, status, title")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (woErr) { console.error("Failed to load work orders:", woErr.message); process.exit(1); }

  // Build map: mx_id (number) → equipt WO row
  const equipWOByMxId = new Map();
  for (const wo of equipWOs) {
    const mxId = extractMxId(wo.work_order_number);
    if (mxId !== null) equipWOByMxId.set(mxId, wo);
  }
  console.log(`    ${equipWOs.length} WOs loaded, ${equipWOByMxId.size} with MaintainX IDs\n`);

  // ── 2. Load Equipt parts ──────────────────────────────────────────────────
  console.log("📥  Loading Equipt parts…");
  const { data: equipParts, error: partsErr } = await supabase
    .from("parts")
    .select("id, part_number, name, unit_cost")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (partsErr) { console.error("Failed to load parts:", partsErr.message); process.exit(1); }

  const equipPartByNumber = new Map(
    equipParts
      .filter((p) => p.part_number)
      .map((p) => [normalize(p.part_number), p])
  );
  const equipPartByName = new Map(
    equipParts.map((p) => [normalize(p.name), p])
  );
  console.log(`    ${equipParts.length} parts loaded\n`);

  // ── 3. Load existing wo_parts to avoid duplicates ─────────────────────────
  const { data: existing } = await supabase
    .from("wo_parts")
    .select("work_order_id, part_id")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  const existingSet = new Set((existing ?? []).map((r) => `${r.work_order_id}:${r.part_id}`));

  // ── 4. Fetch MaintainX work orders list ──────────────────────────────────
  console.log("📥  Fetching MaintainX work orders…");
  const mxWOs = await fetchAllPages("workOrders", "/workorders?limit=100");
  console.log(`    ${mxWOs.length} WOs found`);
  console.log(`    Fetching individual WO details for parts data…\n`);

  // ── 5. Fetch each WO detail individually (list endpoint omits parts) ──────
  const toInsert = [];
  let noWOMatch = 0, noPartMatch = 0, alreadyLinked = 0, wosFetched = 0, wosWithParts = 0;

  // Cool down before individual fetches
  await sleep(5000);

  for (let i = 0; i < mxWOs.length; i++) {
    const mxWO = mxWOs[i];
    const mxId = mxWO.id;

    const equipWO = equipWOByMxId.get(mxId);
    if (!equipWO) {
      noWOMatch++;
      await sleep(DELAY_MS);
      continue;
    }

    // Fetch full WO detail to get parts
    let detail;
    try {
      const res = await mxGet(`/workorders/${mxId}`);
      detail = res.workOrder ?? res;
    } catch {
      detail = mxWO;
    }
    await sleep(DELAY_MS);
    wosFetched++;

    if ((i + 1) % 50 === 0) console.log(`    … ${i + 1}/${mxWOs.length}`);

    const mxParts = detail.parts ?? [];
    if (mxParts.length === 0) continue;
    wosWithParts++;

    for (const mxPart of mxParts) {
      // Match part — try part number first, then name
      let equipPart = mxPart.partNumber
        ? equipPartByNumber.get(normalize(mxPart.partNumber))
        : null;
      if (!equipPart) equipPart = equipPartByName.get(normalize(mxPart.name));

      if (!equipPart) {
        console.log(`  ⚠️  No part match: "${mxPart.name}" (WO ${equipWO.work_order_number}) — skipping`);
        noPartMatch++;
        continue;
      }

      const key = `${equipWO.id}:${equipPart.id}`;
      if (existingSet.has(key)) {
        alreadyLinked++;
        continue;
      }

      const quantity = mxPart.quantity ?? mxPart.totalQuantity ?? 1;
      const unitCost = equipPart.unit_cost ?? 0;

      toInsert.push({
        org_id:         ORG_ID,
        work_order_id:  equipWO.id,
        part_id:        equipPart.id,
        part_name:      equipPart.name,
        part_number:    equipPart.part_number ?? "",
        quantity:       quantity,
        unit_cost:      unitCost,
      });
      existingSet.add(key);

      console.log(`  ✓  ${equipWO.work_order_number} "${equipWO.title?.slice(0, 25)}"  ↔  "${equipPart.name?.slice(0, 30)}" ×${quantity}`);
    }
  }

  // ── 6. Insert ─────────────────────────────────────────────────────────────
  let inserted = 0;
  if (!DRY_RUN && toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase
        .from("wo_parts")
        .upsert(batch, { onConflict: "work_order_id,part_id", ignoreDuplicates: true });
      if (error) {
        console.error(`  ❌  Insert error: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }
  } else {
    inserted = toInsert.length;
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MX WOs with parts        : ${wosWithParts}
  Equipt WO matches        : ${wosFetched}
  No WO match (skipped)    : ${noWOMatch}
  Links to insert          : ${toInsert.length}
  Inserted                 : ${inserted}
  Already linked (skipped) : ${alreadyLinked}
  No part match            : ${noPartMatch}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN — re-run without DRY_RUN=true to apply." : ""}
`);
}

run().catch((e) => { console.error(e); process.exit(1); });
