/**
 * bulk-upload-asset-images.mjs
 *
 * Reads image files from a directory, uploads each to Supabase Storage
 * (thumbnails bucket), then updates assets.photo_url where asset_tag
 * matches the filename stem.
 *
 * File naming convention: <ASSET_TAG>.<ext>  (e.g. "EQP-001.jpg")
 * Asset tags are matched case-insensitively. Underscores in filenames
 * are also tried as spaces (OneDrive encodes spaces as underscores).
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   ORG_ID=619de9bb-f8f8-46cf-983c-9faf54f6a7d0 \
 *   IMAGES_DIR=/path/to/images \
 *   node scripts/bulk-upload-asset-images.mjs
 *
 * Optional:
 *   DRY_RUN=true   — skip uploads/updates, just log what would happen
 */

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "fs/promises";
import { extname, basename, join } from "path";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID               = process.env.ORG_ID;
const IMAGES_DIR           = process.env.IMAGES_DIR;
const DRY_RUN              = process.env.DRY_RUN === "true";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ORG_ID || !IMAGES_DIR) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID, IMAGES_DIR");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {
  console.log(`\n📂  Reading images from: ${IMAGES_DIR}`);
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes will happen\n");

  // Load all image files
  const allFiles = await readdir(IMAGES_DIR);
  const imageFiles = allFiles.filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()));
  console.log(`Found ${imageFiles.length} image file(s)\n`);

  // Load all assets for this org
  const { data: assets, error: assetsErr } = await supabase
    .from("assets")
    .select("id, asset_tag, photo_url")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);

  if (assetsErr) { console.error("Failed to load assets:", assetsErr.message); process.exit(1); }

  // Build lookup map: normalised asset_tag → row
  // Also index by underscore-normalised version (spaces → underscores and vice versa)
  const assetMap = new Map(assets.map((a) => [a.asset_tag?.toLowerCase()?.trim(), a]));

  // Helper: resolve filename stem → matched asset row.
  // Tries stem as-is, then with underscores replaced by spaces.
  function resolve(stem) {
    const candidates = [
      stem.toLowerCase(),
      stem.toLowerCase().replace(/_/g, " "),
    ];
    for (const key of candidates) {
      const asset = assetMap.get(key);
      if (asset) return asset;
    }
    return null;
  }

  let uploaded = 0, updatedAssets = 0, skipped = 0, errors = 0;

  for (const filename of imageFiles) {
    const ext   = extname(filename).toLowerCase();
    const stem  = basename(filename, ext).trim();
    const asset = resolve(stem);

    if (!asset) {
      console.log(`  ⚠️  No match for "${stem}" — skipping`);
      skipped++;
      continue;
    }

    // Use the actual DB asset_tag for the storage path so it's consistent
    const assetTag    = asset.asset_tag;
    const storagePath = `assets/${assetTag}${ext}`;
    let publicUrl = "";

    if (!DRY_RUN) {
      const fileBuffer = await readFile(join(IMAGES_DIR, filename));
      const mimeType = ext === ".png"  ? "image/png"
        : ext === ".webp" ? "image/webp"
        : ext === ".gif"  ? "image/gif"
        : "image/jpeg";

      const { error: uploadErr } = await supabase.storage
        .from("thumbnails")
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        console.error(`  ❌  Upload failed for "${assetTag}": ${uploadErr.message}`);
        errors++;
        continue;
      }

      const { data: urlData } = supabase.storage.from("thumbnails").getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
      uploaded++;
    } else {
      publicUrl = `[DRY_RUN] https://.../thumbnails/${storagePath}`;
      uploaded++;
    }

    // Update assets row
    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from("assets")
        .update({ photo_url: publicUrl })
        .eq("id", asset.id);

      if (updateErr) {
        console.error(`  ❌  Failed to update asset "${assetTag}": ${updateErr.message}`);
        errors++;
      } else {
        updatedAssets++;
      }
    } else {
      updatedAssets++;
    }

    console.log(`  ✓  ${assetTag}  →  ${publicUrl}`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Images processed : ${imageFiles.length}
  Uploaded         : ${uploaded}
  Assets updated   : ${updatedAssets}
  No match (skipped): ${skipped}
  Errors           : ${errors}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN complete — re-run without DRY_RUN=true to apply changes." : ""}
`);
}

run().catch((err) => { console.error(err); process.exit(1); });
