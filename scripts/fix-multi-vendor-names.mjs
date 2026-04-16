/**
 * fix-multi-vendor-names.mjs
 *
 * When parts were imported with multiple vendors, all vendor names were
 * concatenated into vendor_name with no space after the comma separator
 * (e.g. "Scag,Richey & Clapper, Inc.,Motorsports International").
 *
 * This script:
 *  1. Loads all known vendors from the DB
 *  2. Finds product_items (and parts) with concatenated vendor_name values
 *  3. Splits them by matching known vendor names greedily
 *  4. Sets vendor_id/vendor_name to the first match, alternate_vendors to the rest
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   ORG_ID=619de9bb-... \
 *   node scripts/fix-multi-vendor-names.mjs
 *
 * Optional: DRY_RUN=true
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID            = process.env.ORG_ID;
const DRY_RUN           = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Given a concatenated vendor_name string and a list of known vendor names,
 * greedily extract all vendor name segments.
 *
 * Strategy: split on commas NOT followed by a space. This works because:
 *  - Multi-vendor separator: "Scag,Richey & Clapper"  → comma with NO space
 *  - Intra-name commas:      "Richey & Clapper, Inc." → comma WITH space
 *
 * After splitting we also do a secondary pass: if a segment doesn't match a
 * known vendor, try re-joining with the next segment (handles edge cases where
 * a vendor name contains a comma-space that got mangled).
 */
function splitVendorNames(raw, vendorByName) {
  // Split on comma NOT followed by space
  const segments = raw.split(/,(?! )/);

  const result = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i].trim();
    if (vendorByName.has(seg.toLowerCase())) {
      result.push(seg);
      i++;
    } else {
      // Try joining with next segment (e.g. if "Foo, Inc." was split incorrectly)
      if (i + 1 < segments.length) {
        const joined = `${seg}, ${segments[i + 1].trim()}`;
        if (vendorByName.has(joined.toLowerCase())) {
          result.push(joined);
          i += 2;
          continue;
        }
      }
      // No match — keep segment as-is (best effort)
      result.push(seg);
      i++;
    }
  }
  return result;
}

async function processTable(tableName) {
  console.log(`\n📋  Processing table: ${tableName}`);

  // Load all rows that likely have multi-vendor names (comma present)
  const { data: rows, error } = await supabase
    .from(tableName)
    .select("id, vendor_name, vendor_id, alternate_vendors")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null)
    .not("vendor_name", "is", null);

  if (error) {
    console.error(`  ❌  Failed to load ${tableName}: ${error.message}`);
    return;
  }

  // Only rows where vendor_name contains a comma-without-space (multi-vendor indicator)
  const affected = rows.filter((r) => /,(?! )/.test(r.vendor_name ?? ""));
  console.log(`    ${affected.length} rows with concatenated vendor names (out of ${rows.length} total)`);

  if (affected.length === 0) return;

  // Load vendors
  const { data: vendors, error: vErr } = await supabase
    .from("vendors")
    .select("id, name")
    .is("deleted_at", null);
  if (vErr) { console.error(`  ❌  Failed to load vendors: ${vErr.message}`); return; }

  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v]));

  let fixed = 0, unmatched = 0;

  for (const row of affected) {
    const segments = splitVendorNames(row.vendor_name, vendorByName);

    if (segments.length < 2) continue; // nothing to split

    const primaryName = segments[0];
    const primaryVendor = vendorByName.get(primaryName.toLowerCase());

    const alternates = segments.slice(1).map((name) => {
      const v = vendorByName.get(name.toLowerCase());
      return { vendorId: v?.id ?? null, vendorName: name };
    });

    const hasUnmatched = !primaryVendor || alternates.some((a) => !a.vendorId);
    if (hasUnmatched) {
      console.log(`  ⚠️  Partial match for: "${row.vendor_name}"`);
      console.log(`       Segments: ${JSON.stringify(segments)}`);
      unmatched++;
    }

    console.log(`  ✓  "${row.vendor_name}"`);
    console.log(`       Primary : ${primaryVendor?.name ?? `[UNKNOWN: ${primaryName}]`}`);
    if (alternates.length > 0) {
      console.log(`       Alternates: ${alternates.map((a) => a.vendorName).join(", ")}`);
    }

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from(tableName)
        .update({
          vendor_name:       primaryName,
          vendor_id:         primaryVendor?.id ?? null,
          alternate_vendors: alternates,
        })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`  ❌  Update failed for ${row.id}: ${updateErr.message}`);
      } else {
        fixed++;
      }
    } else {
      fixed++;
    }
  }

  console.log(`
  ─────────────────────────────────────
    Affected rows  : ${affected.length}
    Fixed          : ${fixed}
    Partial match  : ${unmatched}
  ─────────────────────────────────────`);
}

async function run() {
  console.log(`\n🔧  Multi-vendor name split — ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await processTable("product_items");
  await processTable("parts");

  console.log(`\n${DRY_RUN ? "🧪  DRY RUN complete — re-run without DRY_RUN=true to apply." : "✅  Done."}\n`);
}

run().catch((e) => { console.error(e); process.exit(1); });
