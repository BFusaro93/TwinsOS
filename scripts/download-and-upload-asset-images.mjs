/**
 * download-and-upload-asset-images.mjs
 *
 * 1. Reads assettiger-assets.json (exported from the browser)
 * 2. Downloads each image from AssetTiger
 * 3. Uploads to Supabase Storage (thumbnails/assets/)
 * 4. Updates assets.photo_url where asset_tag matches
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   ORG_ID=619de9bb-f8f8-46cf-983c-9faf54f6a7d0 \
 *   ASSET_JSON=/path/to/assettiger-assets.json \
 *   node scripts/download-and-upload-asset-images.mjs
 *
 * Optional:
 *   DRY_RUN=true   — skip uploads/updates, just log what would happen
 *   COOKIE=...     — AssetTiger session cookie if images return 403
 */

import { createClient } from "@supabase/supabase-js";
import { readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { tmpdir } from "os";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID               = process.env.ORG_ID;
const ASSET_JSON           = process.env.ASSET_JSON
  || `${process.env.HOME}/Downloads/assettiger-assets.json`;
const DRY_RUN              = process.env.DRY_RUN === "true";
const COOKIE               = process.env.COOKIE || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID");
  process.exit(1);
}

if (!existsSync(ASSET_JSON)) {
  console.error(`Asset JSON not found at: ${ASSET_JSON}`);
  console.error("Export it from AssetTiger by running the browser script first.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Temp dir for downloaded images
const TEMP_DIR = join(tmpdir(), "assettiger-images");

async function fetchImage(url) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.assettiger.com/",
  };
  if (COOKIE) headers["Cookie"] = COOKIE;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function mimeForExt(ext) {
  switch (ext) {
    case ".png":  return "image/png";
    case ".webp": return "image/webp";
    case ".gif":  return "image/gif";
    default:      return "image/jpeg";
  }
}

async function run() {
  console.log(`\n📋  Reading asset list from: ${ASSET_JSON}`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes will happen\n");

  const assetList = JSON.parse(await readFile(ASSET_JSON, "utf8"));
  console.log(`Found ${assetList.length} assets in JSON\n`);

  // Load DB assets for this org
  const { data: dbAssets, error: assetsErr } = await supabase
    .from("assets")
    .select("id, asset_tag, photo_url")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);

  if (assetsErr) { console.error("Failed to load assets:", assetsErr.message); process.exit(1); }

  // Build lookup: normalised asset_tag → db row
  const assetMap = new Map(dbAssets.map((a) => [a.asset_tag?.toLowerCase()?.trim(), a]));

  if (!DRY_RUN) await mkdir(TEMP_DIR, { recursive: true });

  let downloaded = 0, uploaded = 0, updated = 0, skipped = 0, errors = 0;

  for (const { tag, url, ext } of assetList) {
    // Match against DB — try as-is, leading-zero-stripped, and underscore↔space swap
    const stripped = String(parseInt(tag, 10)); // "00027" → "27"
    const candidates = [
      tag.toLowerCase(),
      stripped.toLowerCase(),
      tag.toLowerCase().replace(/_/g, " "),
      stripped.toLowerCase().replace(/_/g, " "),
    ];
    let dbAsset = null;
    for (const key of candidates) {
      dbAsset = assetMap.get(key);
      if (dbAsset) break;
    }

    if (!dbAsset) {
      console.log(`  ⚠️  No DB match for tag "${tag}" — skipping`);
      skipped++;
      continue;
    }

    const fileExt     = ext.startsWith(".") ? ext : `.${ext}`;
    const storagePath = `assets/${dbAsset.asset_tag}${fileExt}`;
    let publicUrl     = "";

    if (!DRY_RUN) {
      // Download image
      let imgBuffer;
      try {
        imgBuffer = await fetchImage(url);
        downloaded++;
      } catch (err) {
        console.error(`  ❌  Download failed for "${tag}": ${err.message}`);
        errors++;
        continue;
      }

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from("thumbnails")
        .upload(storagePath, imgBuffer, { contentType: mimeForExt(fileExt), upsert: true });

      if (uploadErr) {
        console.error(`  ❌  Upload failed for "${tag}": ${uploadErr.message}`);
        errors++;
        continue;
      }

      const { data: urlData } = supabase.storage.from("thumbnails").getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
      uploaded++;

      // Update assets row
      const { error: updateErr } = await supabase
        .from("assets")
        .update({ photo_url: publicUrl })
        .eq("id", dbAsset.id);

      if (updateErr) {
        console.error(`  ❌  DB update failed for "${tag}": ${updateErr.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      publicUrl = `[DRY_RUN] https://.../thumbnails/${storagePath}`;
      downloaded++;
      uploaded++;
      updated++;
    }

    console.log(`  ✓  ${dbAsset.asset_tag}  →  ${publicUrl}`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Assets in JSON   : ${assetList.length}
  Downloaded       : ${downloaded}
  Uploaded         : ${uploaded}
  Assets updated   : ${updated}
  No DB match      : ${skipped}
  Errors           : ${errors}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN complete — re-run without DRY_RUN=true to apply changes." : ""}
`);
}

run().catch((err) => { console.error(err); process.exit(1); });
