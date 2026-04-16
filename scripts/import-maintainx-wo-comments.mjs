/**
 * import-maintainx-wo-comments.mjs
 *
 * Fetches all MaintainX work order comments, matches each MX WO to an
 * Equipt WO by normalized title, resolves author names via the MX users
 * API, and inserts rows into the polymorphic `comments` table
 * (record_type = 'work_order').
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

async function run() {
  console.log(`\n💬  MaintainX → Equipt WO comments import`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes\n");

  // ── 1. Fetch MX users → name map ─────────────────────────────────────────
  console.log("📥  Fetching MaintainX users…");
  const mxUsers = await fetchAllPages("users", "/users?limit=100");
  const mxUserNames = new Map(
    mxUsers.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()])
  );
  console.log(`    ${mxUsers.length} users loaded\n`);

  // ── 2. Fetch all MX WOs ───────────────────────────────────────────────────
  console.log("📥  Fetching MaintainX work orders…");
  const mxWOs = await fetchAllPages("workOrders", "/workorders?limit=100");
  console.log(`    ${mxWOs.length} WOs found\n`);

  // ── 3. Load Equipt WOs → build title lookup ───────────────────────────────
  console.log("📥  Loading Equipt work orders…");
  const { data: equipWOs, error: woErr } = await supabase
    .from("work_orders")
    .select("id, title, asset_name")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);
  if (woErr) { console.error("Failed:", woErr.message); process.exit(1); }

  const equipWOsByTitle = new Map();
  for (const wo of equipWOs) {
    const key = normalize(wo.title);
    if (!equipWOsByTitle.has(key)) equipWOsByTitle.set(key, []);
    equipWOsByTitle.get(key).push(wo);
  }
  console.log(`    ${equipWOs.length} WOs loaded\n`);

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
    const mxWO = mxWOs[i];
    const titleKey = normalize(mxWO.title ?? "");

    // Match to Equipt WO
    const candidates = equipWOsByTitle.get(titleKey) ?? [];
    let equipWO = null;
    if (candidates.length === 0) {
      noWOMatch++;
      await sleep(DELAY_MS);
      continue;
    } else if (candidates.length === 1) {
      equipWO = candidates[0];
    } else {
      // Narrow by asset name using the MX WO's asset — fetch detail for assetId
      // For simplicity, just take the first candidate (title match is usually sufficient)
      equipWO = candidates[0];
    }

    // Fetch comments
    let comments = [];
    try {
      const data = await mxGet(`/workorders/${mxWO.id}/comments`);
      comments = data.comments ?? [];
    } catch (e) {
      console.log(`  ⚠️  Failed to fetch comments for MX WO ${mxWO.id}: ${e.message}`);
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
      const body      = (c.content ?? "").trim();
      const createdAt = c.createdAt ?? new Date().toISOString();
      const authorName = mxUserNames.get(c.authorId) ?? `MaintainX User ${c.authorId}`;
      const key = `${equipWO.id}|${body}|${createdAt}`;

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

      console.log(`  ✓  "${mxWO.title?.slice(0, 30)}"  by ${authorName}: "${body.slice(0, 50).replace(/\n/g, " ")}…"`);
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
