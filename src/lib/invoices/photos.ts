import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { INVOICE_PHOTO_LIMIT } from "@/types/invoice-photos";
import type { InvoicePDFPhoto } from "@/components/crm/invoices/pdf/InvoiceDocument";

const log = logger.child("invoice-photos");

// Bucket a path lives in is stored on the row because job photos live in
// their own buckets while visit photos / direct uploads use "attachments".
export type PhotoBucket = "attachments" | "job-photos-original" | "job-photos-annotated";

// PDF budget: keep the rendered PDF (also emailed as an attachment) well under
// ~10MB. Phone photos are routinely 3-8MB, so each one is downscaled and
// re-encoded before it is embedded (a 4-up photo page prints at well under
// 1600px); a photo that can't be processed is embedded as-is only if it is small.
const MAX_RAW_BYTES = 2.5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const PDF_PHOTO_MAX_EDGE = 1600;
const PDF_PHOTO_JPEG_QUALITY = 78;
const FETCH_TIMEOUT_MS = 10_000;
// @react-pdf/renderer can only decode JPEG and PNG.
const PDF_MIME = new Set(["image/jpeg", "image/jpg", "image/png"]);

export interface AttachedPhotoRow {
  id: string;
  bucket: PhotoBucket;
  storage_path: string;
  caption: string | null;
  sort_order: number;
}

/** Signs many paths per bucket in as few calls as possible. Returns a map of
 *  `${bucket}:${path}` -> signed URL. Failures simply omit the entry. */
export async function signPhotoPaths(
  service: SupabaseClient,
  items: { bucket: PhotoBucket; path: string }[],
  expiresIn: number
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byBucket = new Map<PhotoBucket, string[]>();
  for (const it of items) {
    const list = byBucket.get(it.bucket) ?? [];
    list.push(it.path);
    byBucket.set(it.bucket, list);
  }
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await service.storage.from(bucket).createSignedUrls(paths, expiresIn);
    if (error || !data) {
      log.warn("createSignedUrls failed", { bucket, error: error?.message });
      continue;
    }
    for (const row of data) {
      if (row.signedUrl && row.path) out.set(`${bucket}:${row.path}`, row.signedUrl);
    }
  }
  return out;
}

/** Loads the invoice's attached photos as base64 data URIs for the PDF.
 *  Failure-tolerant: a photo that can't be downloaded / decoded / fits the
 *  budget is skipped rather than failing the PDF. Always scoped by org_id. */
export async function loadInvoicePhotosForPdf(
  invoiceId: string,
  orgId: string
): Promise<InvoicePDFPhoto[]> {
  try {
    const service = createServiceClient() as unknown as SupabaseClient;
    const { data, error } = await service
      .from("invoice_photos")
      .select("id, bucket, storage_path, caption, sort_order")
      .eq("invoice_id", invoiceId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(INVOICE_PHOTO_LIMIT);
    if (error) {
      log.error("load invoice photos failed", { invoiceId, error: error.message });
      return [];
    }
    const rows = (data ?? []) as AttachedPhotoRow[];
    // Defense in depth: a path outside this org's folder is never signed.
    const safe = rows.filter((r) => r.storage_path.startsWith(`${orgId}/`));
    const signed = await signPhotoPaths(
      service,
      safe.map((r) => ({ bucket: r.bucket, path: r.storage_path })),
      300
    );

    const photos: InvoicePDFPhoto[] = [];
    let total = 0;
    for (const r of safe) {
      const url = signed.get(`${r.bucket}:${r.storage_path}`);
      if (!url) continue;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) continue;
        const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        // Storage may serve a generic type; sharp sniffs the real format below.
        if (!PDF_MIME.has(mime) && !mime.startsWith("image/") && mime !== "application/octet-stream") continue;
        const raw = Buffer.from(await res.arrayBuffer());
        let buf: Buffer;
        let outMime = mime;
        try {
          // rotate() applies the EXIF orientation, which phone photos rely on.
          buf = await sharp(raw)
            .rotate()
            .resize({ width: PDF_PHOTO_MAX_EDGE, height: PDF_PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: PDF_PHOTO_JPEG_QUALITY, mozjpeg: true })
            .toBuffer();
          outMime = "image/jpeg";
        } catch (err) {
          log.warn("photo resize failed", { invoiceId, photoId: r.id, error: err instanceof Error ? err.message : String(err) });
          if (!PDF_MIME.has(mime) || raw.length > MAX_RAW_BYTES) continue;
          buf = raw;
        }
        if (total + buf.length > MAX_TOTAL_BYTES) continue;
        total += buf.length;
        photos.push({ caption: r.caption, dataUri: `data:${outMime};base64,${buf.toString("base64")}` });
      } catch (err) {
        log.warn("photo download failed; skipping", { invoiceId, photoId: r.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return photos;
  } catch (err) {
    log.error("loadInvoicePhotosForPdf failed", { invoiceId, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
