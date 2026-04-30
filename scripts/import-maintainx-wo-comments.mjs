/**
 * import-maintainx-wo-comments.mjs
 *
 * Fetches all MaintainX work order comments, matches each MX WO to an
 * Equipt WO via the numeric middle segment of work_order_number
 * (e.g. "WO-054424-2ak" → MaintainX WO id 54424), resolves author names
 * via the MX users API, and inserts rows into the polymorphic `comments`
 * table (record_type = 'work_order').
 *
 * Safe to re-run — deduplicates by (record_id, body, created_at).
 *
 * Usage:
 *   MX_TOKEN=eyJ... \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   ORG_ID=619de9bb-... \
 *   node scripts/import-maintainx-wo-comments.mjs
 *
 * Optional:
 *   DRY_RUN=true          — print what would be inserted without writing
 *   MX_WO_IDS=54424,55241 — only process these MaintainX WO IDs (comma-separated)
 */

import { createClient } from "@supabase/supabase-js";

const MX_TOKEN             = process.env.MX_TOKEN;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID               = process.env.ORG_ID;
const DRY_RUN              = process.env.DRY_RUN === "true";
const MX_WO_IDS_FILTER     = process.env.MX_WO_IDS
  ? new Set(process.env.MX_WO_IDS.split(",").map((s) => parseInt(s.trim(), 10)))
  : null;
const MX_BASE              = "https://api.getmaintainx.com/v1";

if (!MX_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID) {
  console.error("Missing required env vars: MX_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

const DELAY_MS = 350;

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
 * Format: "WO-054424-2ak" → 54424
 */
function extractMxId(woNumber) {
  const match = woNumber?.match(/^WO-0*(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

async function run() {
  console.log(`\n💬  MaintainX → Equipt WO comments import (ID-based matching)`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes\n");
  if (MX_WO_IDS_FILTER) console.log(`🔍  Filtering to MX WO IDs: ${[...MX_WO_IDS_FILTER].join(", ")}\n`);

  // ── 1. Fetch MX users → name map ─────────────────────────────────────────
  console.log("📥  Fetching MaintainX users…");
  const mxUsers = await fetchAllPages("users", "/users?limit=100");
  const mxUserNames = new Map(
    mxUsers.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()])
  );
  console.log(`    ${mxUsers.length} users loaded\n`);

  // ── 2. Fetch all MX WOs (or just the filtered set) ───────────────────────
  let mxWOs;
  if (MX_WO_IDS_FILTER) {
    console.log("📥  Fetching specific MaintainX work orders…");
    mxWOs = [];
    for (const mxId of MX_WO_IDS_FILTER) {
      try {
        const data = await mxGet(`/workorders/${mxId}`);
        const wo = data.workOrder ?? data;
        if (wo?.id) mxWOs.push(wo);
        await sleep(DELAY_MS);
      } catch (e) {
        console.log(`  ⚠️  Failed to fetch MX WO ${mxId}: ${e.message}`);
      }
    }
  } else {
    console.log("📥  Fetching all MaintainX work orders…");
    mxWOs = await fetchAllPages("workOrders", "/workorders?limit=100");
  }
  console.log(`    ${mxWOs.length} WOs found\n`);

  // ── 3. Load Equipt WOs → build MX-ID lookup ──────────────────────────────
  console.log("📥  Loading Equipt work orders…");
  const { data: equipWOs, error: woErr } = await supabase
    .from("work_orders")
    .select("id, title, asset_name, work_order_number")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (woErr) { console.error("Failed:", woErr.message); process.exit(1); }

  // Map: mxNumericId → Equipt WO row
  const equipWOsByMxId = new Map();
  for (const wo of equipWOs) {
    const mxId = extractMxId(wo.work_order_number);
    if (mxId != null) equipWOsByMxId.set(mxId, wo);
  }
  console.log(`    ${equipWOs.length} WOs loaded (${equipWOsByMxId.size} with MX IDs)\n`);

  // ── 4. Load existing comments to avoid duplicates ─────────────────────────
  console.log("📥  Loading existing WO comments…");
  const { data: existing } = await supabase
    .from("comments")
    .select("record_id, body, created_at")
    .eq("org_id", ORG_ID)
    .eq("record_type", "work_order")
    .is("deleted_at", null);

  const existingSet = new Set(
    (existing ?? []).map((c) => `${c.record_id}|${c.body}|${c.created_at}`)
  );
  console.log(`    ${existingSet.size} existing comments loaded\n`);

  // ── 5. Fetch comments for each matched WO ─────────────────────────────────
  console.log("📥  Fetching comments for each WO…\n");
  const toInsert = [];
  let noWOMatch = 0, noComments = 0, alreadyLinked = 0, wosFetched = 0;

  for (let i = 0; i < mxWOs.length; i++) {
    const mxWO   = mxWOs[i];
    const mxId   = typeof mxWO.id === "number" ? mxWO.id : parseInt(mxWO.id, 10);
    const equipWO = equipWOsByMxId.get(mxId);

    if (!equipWO) {
      noWOMatch++;
      if ((i + 1) % 50 === 0) console.log(`    … ${i + 1}/${mxWOs.length} WOs processed`);
      await sleep(DELAY_MS);
      continue;
    }

    // Fetch comments for this MX WO
    let comments = [];
    try {
      const data = await mxGet(`/workorders/${mxId}/comments`);
      comments = data.comments ?? [];
    } catch (e) {
      console.log(`  ⚠️  Failed to fetch comments for MX WO ${mxId}: ${e.message}`);
      await sleep(DELAY_MS);
      continue;
    }
    await sleep(DELAY_MS);
    wosFetched++;

    if ((i + 1) % 50 === 0) console.log(`    … ${i + 1}/${mxWOs.length} WOs processed`);

    if (comments.length === 0) {
      noComments++;
      continue;
    }

    for (const c of comments) {
      const body       = (c.content ?? "").trim();
      const createdAt  = c.createdAt ?? new Date().toISOString();
      const authorName = mxUserNames.get(c.authorId) ?? `MaintainX User ${c.authorId}`;
      const key        = `${equipWO.id}|${body}|${createdAt}`;

      if (existingSet.has(key)) {
        alreadyLinked++;
        continue;
      }

      toInsert.push({
        org_id:      ORG_ID,
        record_type: "work_order",
        record_id:   equipWO.id,
        author_name: authorName,
        body,
        created_at:  createdAt,
        updated_at:  createdAt,
      });
      existingSet.add(key);

      console.log(`  ✓  [MX ${mxId}] "${(mxWO.title ?? "").slice(0, 30)}" (${equipWO.asset_name ?? ""})  by ${authorName}: "${body.slice(0, 60).replace(/\n/g, " ")}"`);
    }
  }

  // ── 6. Insert ─────────────────────────────────────────────────────────────
  let inserted = 0;
  if (!DRY_RUN && toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase.from("comments").insert(batch);
      if (error) console.error(`  ❌  Insert error: ${error.message}`);
      else inserted += batch.length;
    }
  } else {
    inserted = toInsert.length;
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MX WOs checked           : ${mxWOs.length}
  WOs fetched for comments : ${wosFetched}
  No WO match in Equipt    : ${noWOMatch}
  WOs with no comments     : ${noComments}
  Comments to insert       : ${toInsert.length}
  Inserted                 : ${inserted}
  Already present (skipped): ${alreadyLinked}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN — re-run without DRY_RUN=true to apply." : ""}
`);
}

run().catch((e) => { console.error(e); process.exit(1); });
