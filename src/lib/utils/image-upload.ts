import { isHeic } from "@/lib/utils/convert-heic";

/** Raster image types accepted for photo uploads. SVG is deliberately absent
 * (scriptable when opened directly from storage). */
const IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Validates an uploaded photo's type and size. Returns the (lowercased)
 * content type and a safe extension to use when storing it, or an error
 * message suitable for a 400 response. HEIC with an empty/generic MIME is
 * recognised by extension (some browsers don't set a type for it).
 */
export function validateImageUpload(
  file: { type?: string | null; name?: string | null; size: number }
): { ok: true; contentType: string; ext: string } | { ok: false; error: string } {
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return { ok: false, error: "Photos must be 25MB or smaller" };
  }
  const mime = (file.type ?? "").toLowerCase();
  if (IMAGE_MIME_EXT[mime]) return { ok: true, contentType: mime, ext: IMAGE_MIME_EXT[mime] };
  if (isHeic(file)) return { ok: true, contentType: "image/heic", ext: "heic" };
  return { ok: false, error: "Only JPEG, PNG, WebP, GIF or HEIC images are allowed" };
}
