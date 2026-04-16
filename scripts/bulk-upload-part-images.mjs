/**
 * bulk-upload-part-images.mjs
 *
 * Reads image files from a directory, uploads each to Supabase Storage
 * (thumbnails bucket), then updates parts.picture_url and
 * product_items.picture_url where part_number matches the filename stem.
 *
 * File naming convention: <PART_NUMBER>.<ext>  (e.g. "KAGE-DE10.jpg")
 * Part numbers are matched case-insensitively.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   ORG_ID=619de9bb-f8f8-46cf-983c-9faf54f6a7d0 \
 *   IMAGES_DIR=/path/to/images \
 *   node scripts/bulk-upload-part-images.mjs
 *
 * Optional:
 *   DRY_RUN=true   — skip uploads/updates, just log what would happen
 */

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "fs/promises";
import { extname, basename, join } from "path";

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID           = process.env.ORG_ID;
const IMAGES_DIR       = process.env.IMAGES_DIR;
const DRY_RUN          = process.env.DRY_RUN === "true";

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

  // Load all parts for this org (id + part_number + current picture_url)
  const { data: parts, error: partsErr } = await supabase
    .from("parts")
    .select("id, part_number, picture_url")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);

  if (partsErr) { console.error("Failed to load parts:", partsErr.message); process.exit(1); }

  // Load all product_items for this org
  const { data: products, error: prodErr } = await supabase
    .from("product_items")
    .select("id, part_number, picture_url")
    .eq("org_id", ORG_ID)
    .is("deleted_at", null);

  if (prodErr) { console.error("Failed to load product_items:", prodErr.message); process.exit(1); }

  // Build lookup maps: normalised part_number → row
  const partMap     = new Map(parts.map((p)  => [p.part_number?.toLowerCase()?.trim(), p]));
  const productMap  = new Map(products.map((p) => [p.part_number?.toLowerCase()?.trim(), p]));

  // Helper: resolve filename stem → matched part number string and DB rows.
  // Tries the stem as-is, then with underscores replaced by spaces (OneDrive
  // encodes spaces as underscores in filenames).
  function resolve(stem) {
    const candidates = [stem.toLowerCase(), stem.toLowerCase().replace(/_/g, " ")];
    for (const key of candidates) {
      const part    = partMap.get(key);
      const product = productMap.get(key);
      if (part || product) return { key, part: part ?? null, product: product ?? null };
    }
    return null;
  }

  let uploaded = 0, updatedParts = 0, updatedProducts = 0, skipped = 0, errors = 0;

  for (const filename of imageFiles) {
    const ext        = extname(filename).toLowerCase();
    const stem       = basename(filename, ext).trim(); // filename stem = part number
    const resolved   = resolve(stem);

    if (!resolved) {
      console.log(`  ⚠️  No match for "${stem}" — skipping`);
      skipped++;
      continue;
    }

    const { part, product } = resolved;
    // Use the actual DB part_number for the storage path so it's consistent
    const partNumber = (part ?? product).part_number;

    // Upload to Supabase Storage
    const storagePath = `parts/${partNumber}${ext}`;
    let publicUrl = "";

    if (!DRY_RUN) {
      const fileBuffer = await readFile(join(IMAGES_DIR, filename));
      const mimeType = ext === ".png" ? "image/png"
        : ext === ".webp" ? "image/webp"
        : ext === ".gif"  ? "image/gif"
        : "image/jpeg";

      const { error: uploadErr } = await supabase.storage
        .from("thumbnails")
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        console.error(`  ❌  Upload failed for "${partNumber}": ${uploadErr.message}`);
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

    // Update parts row
    if (part) {
      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from("parts")
          .update({ picture_url: publicUrl })
          .eq("id", part.id);

        if (updateErr) {
          console.error(`  ❌  Failed to update parts for "${partNumber}": ${updateErr.message}`);
          errors++;
        } else {
          updatedParts++;
        }
      } else {
        updatedParts++;
      }
    }

    // Update product_items row
    if (product) {
      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from("product_items")
          .update({ picture_url: publicUrl })
          .eq("id", product.id);

        if (updateErr) {
          console.error(`  ❌  Failed to update product_items for "${partNumber}": ${updateErr.message}`);
          errors++;
        } else {
          updatedProducts++;
        }
      } else {
        updatedProducts++;
      }
    }

    console.log(`  ✓  ${partNumber}  →  ${publicUrl}`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Images processed : ${imageFiles.length}
  Uploaded         : ${uploaded}
  Parts updated    : ${updatedParts}
  Products updated : ${updatedProducts}
  No match (skipped): ${skipped}
  Errors           : ${errors}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? "\n🧪  DRY RUN complete — re-run without DRY_RUN=true to apply changes." : ""}
`);
}

run().catch((err) => { console.error(err); process.exit(1); });
