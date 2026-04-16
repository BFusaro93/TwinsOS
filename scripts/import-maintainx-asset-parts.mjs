/**
 * import-maintainx-asset-parts.mjs
 *
 * Fetches all parts from MaintainX, reads their assetIds, maps each
 * MaintainX asset to an Equipt asset via extraFields["Asset Tag ID #"],
 * matches parts by vendor part number then name, and bulk-inserts
 * asset_parts records.
 *
 * Usage:
 *   MX_COOKIE="ajs_anonymous_id=...; .mxa.auth=..." \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   ORG_ID=619de9bb-... \
 *   node scripts/import-maintainx-asset-parts.mjs
 *
 * MX_COOKIE: paste the full cookie string from DevTools Network → Headers → cookie
 * Optional: DRY_RUN=true
 */

import { createClient } from "@supabase/supabase-js";

const MX_COOKIE        = process.env.MX_COOKIE;
const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID           = process.env.ORG_ID;
const DRY_RUN          = process.env.DRY_RUN === "true";
const MX_BASE          = "https://api.getmaintainx.com/v1";

if (!MX_COOKIE || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID) {
  console.error("Missing required env vars: MX_COOKIE, SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID");
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
      headers: { Authorization: `Bearer ${MX_COOKIE}` },
    });
    if (res.status === 429) {
      const wait = 5000 * 2 ** attempt; // start at 5 s, double each retry
      console.log(`    ⏳  Rate limited — waiting ${(wait / 1000).toFixed(0)}s (attempt ${attempt + 1}/${retries})`);
      if (attempt < retries) { await sleep(wait); continue; }
    }
    if (!res.ok) throw new Error(`MaintainX API ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

const DELAY_MS = 300; // ~3 req/s — conservative to avoid rate limits

async function fetchAllPages(listKey, path) {
  const items = [];
  let cursor = null;
  do {
    const url = cursor ? `${path}&cursor=${cursor}` : path;
    const data = await mxGet(url);
    items.push(...(data[listKey] ?? []));
    cursor = data.nextCursor ?? null;
    if (cursor) await sleep(DELAY_MS); // delay between pages
  } while (cursor);
  return items;
}

async function run() {
  console.log(`\n🔗  MaintainX → Equipt asset-parts import`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes\n");

  // ── 1. Fetch all MaintainX parts (with assetIds) ─────────────────────────
  console.log("📥  Fetching MaintainX parts…");
  const mxParts = await fetchAllPages("parts", "/parts?limit=100");
  console.log(`    ${mxParts.length} parts found`);

  // assetIds only appear in the individual part detail endpoint, not the list.
  // Fetch details for all parts to get their asset associations.
  console.log(`    Fetching individual part details for assetIds…`);
  const mxPartsDetailed = [];
  for (let i = 0; i < mxParts.length; i++) {
    const p = mxParts[i];
    try {
      const detail = await mxGet(`/parts/${p.id}`);
      mxPartsDetailed.push(detail.part ?? p);
    } catch {
      mxPartsDetailed.push(p);
    }
    await sleep(DELAY_MS);
    if ((i + 1) % 50 === 0) console.log(`    … ${i + 1}/${mxParts.length}`);
  }

  // Only keep parts that have at least one linked asset
  const mxPartsWithAssets = mxPartsDetailed.filter((p) => p.assetIds?.length > 0);
  console.log(`    ${mxPartsWithAssets.length} of ${mxParts.length} have asset links\n`);

  // Cool down before hammering assets endpoint
  console.log("⏳  Cooling down 10 s before fetching assets…");
  await sleep(10_000);

  // ── 2. Fetch all MaintainX assets (to map id → Asset Tag ID #) ───────────
  console.log("📥  Fetching MaintainX assets…");
  const mxAssets = await fetchAllPages("assets", "/assets?limit=100");
  console.log(`    ${mxAssets.length} assets found`);

  // Need full asset detail for extraFields — fetch individually
  // (list endpoint doesn't include extraFields)
  const mxAssetMap = new Map(); // mx asset id → { tag, name }
  console.log("    Fetching asset details for tag IDs…");
  for (const a of mxAssets) {
    try {
      const detail = await mxGet(`/assets/${a.id}`);
      const tag = detail.asset?.extraFields?.["Asset Tag ID #"];
      mxAssetMap.set(a.id, {
        tag: tag ? String(parseInt(tag, 10)) : null, // strip leading zeros
        name: normalize(a.name),
        rawTag: tag,
      });
    } catch {
      mxAssetMap.set(a.id, { tag: null, name: normalize(a.name), rawTag: null });
    }
    await sleep(DELAY_MS);
  }
  console.log(`    Done\n`);

  // ── 3. Load Equipt parts ──────────────────────────────────────────────────
  const { data: equipParts, error: partsErr } = await supabase
    .from("parts")
    .select("id, part_number, name")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (partsErr) { console.error("Failed to load parts:", partsErr.message); process.exit(1); }

  // Build lookup maps
  const equipPartByNumber = new Map(
    equipParts
      .filter((p) => p.part_number)
      .map((p) => [normalize(p.part_number), p])
  );
  const equipPartByName = new Map(
    equipParts.map((p) => [normalize(p.name), p])
  );

  // ── 4. Load Equipt assets + vehicles (asset_parts is polymorphic) ────────
  const { data: equipAssets, error: assetsErr } = await supabase
    .from("assets")
    .select("id, asset_tag, name")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (assetsErr) { console.error("Failed to load assets:", assetsErr.message); process.exit(1); }

  const { data: equipVehicles, error: vehiclesErr } = await supabase
    .from("vehicles")
    .select("id, asset_tag, name")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (vehiclesErr) { console.error("Failed to load vehicles:", vehiclesErr.message); process.exit(1); }

  // Merge assets and vehicles into unified lookup maps (asset_parts accepts both)
  const allEquipt = [...equipAssets, ...equipVehicles];
  const equipAssetByTag  = new Map(allEquipt.map((a) => [String(a.asset_tag).toLowerCase(), a]));
  const equipAssetByName = new Map(allEquipt.map((a) => [normalize(a.name), a]));
  console.log(`    ${equipAssets.length} assets + ${equipVehicles.length} vehicles loaded\n`);

  // ── 5. Load existing asset_parts to avoid duplicates ─────────────────────
  const { data: existing } = await supabase
    .from("asset_parts")
    .select("asset_id, part_id")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  const existingSet = new Set((existing ?? []).map((r) => `${r.asset_id}:${r.part_id}`));

  // ── 6. Build insert rows ──────────────────────────────────────────────────
  const toInsert = [];
  let noPartMatch = 0, noAssetMatch = 0, alreadyLinked = 0;

  for (const mxPart of mxPartsWithAssets) {
    // Match part — try vendor part numbers first, then name
    let equipPart = null;
    for (const v of (mxPart.vendors ?? mxPart.vendorIds?.map(id => ({ partNumber: null })) ?? [])) {
      if (v.partNumber) {
        equipPart = equipPartByNumber.get(normalize(v.partNumber));
        if (equipPart) break;
      }
    }
    if (!equipPart) equipPart = equipPartByName.get(normalize(mxPart.name));

    if (!equipPart) {
      console.log(`  ⚠️  No part match: "${mxPart.name}" — skipping`);
      noPartMatch++;
      continue;
    }

    for (const mxAssetId of mxPart.assetIds) {
      const mxAsset = mxAssetMap.get(mxAssetId);
      if (!mxAsset) continue;

      // Match asset — try tag first, then name
      let equipAsset = mxAsset.tag ? equipAssetByTag.get(mxAsset.tag.toLowerCase()) : null;
      if (!equipAsset) equipAsset = equipAssetByName.get(mxAsset.name);

      if (!equipAsset) {
        console.log(`  ⚠️  No asset match for mx:${mxAssetId} tag:${mxAsset.rawTag} "${mxAsset.name}" — skipping`);
        noAssetMatch++;
        continue;
      }

      const key = `${equipAsset.id}:${equipPart.id}`;
      if (existingSet.has(key)) {
        alreadyLinked++;
        continue;
      }

      toInsert.push({
        org_id:      ORG_ID,
        asset_id:    equipAsset.id,
        part_id:     equipPart.id,
        part_name:   equipPart.name,
        part_number: equipPart.part_number ?? "",
      });
      existingSet.add(key); // prevent dupes within this run
      console.log(`  ✓  ${equipAsset.asset_tag} "${equipAsset.name?.slice(0,30)}"  ↔  "${equipPart.name?.slice(0,30)}"`);
    }
  }

  // ── 7. Insert ─────────────────────────────────────────────────────────────
  let inserted = 0;
  if (!DRY_RUN && toInsert.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase
        .from("asset_parts")
        .upsert(batch, { onConflict: "asset_id,part_id", ignoreDuplicates: true });
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
  MX parts with asset links : ${mxPartsWithAssets.length}
  Links to insert           : ${toInsert.length}
  Inserted                  : ${inserted}
  Already linked (skipped)  : ${alreadyLinked}
  No part match             : ${noPartMatch}
  No asset match            : ${noAssetMatch}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN — re-run without DRY_RUN=true to apply." : ""}
`);
}

run().catch((e) => { console.error(e); process.exit(1); });
