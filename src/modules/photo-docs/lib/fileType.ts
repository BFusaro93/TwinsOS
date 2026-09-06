/**
 * Effective-MIME-type helpers for the photo-docs upload pipeline.
 *
 * Browsers are unreliable about `File.type`: Chrome on Windows/Android (and
 * some macOS configs) reports `application/octet-stream` or an empty string
 * for iPhone `.heic` files, so validating the raw `file.type` against the
 * allowlist rejected the most common crew upload. Everything that decides
 * "is this an image / is this allowed / what content-type do we store" must
 * go through `getEffectiveMimeType()` so the extension fallback applies
 * consistently in the uploader UI and the upload hook.
 */

// Keep in sync with the job-photos-original / job-photos-annotated Storage
// bucket limits set in supabase/migrations/20260902120000_job_photos_bucket_size_and_mime_limits.sql
export const MAX_PHOTO_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

export const ALLOWED_PHOTO_UPLOAD_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "video/mp4", "video/quicktime", "video/webm", "video/x-m4v",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];

/** Filename extension → MIME, mirroring ALLOWED_PHOTO_UPLOAD_MIME_TYPES. */
const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
};

/** MIME types the browser can't be trusted to have identified. */
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/** MIME type implied by the filename extension, or "" if unknown. */
export function mimeTypeFromFileName(fileName: string): string {
  return EXTENSION_MIME_MAP[getFileExtension(fileName)] ?? "";
}

/**
 * The MIME type we should treat this file as: the browser-reported type when
 * it's specific, otherwise whatever the filename extension implies. Returns
 * "" when neither source knows.
 */
export function getEffectiveMimeType(file: Pick<File, "name" | "type">): string {
  const reported = (file.type ?? "").toLowerCase();
  if (!GENERIC_MIME_TYPES.has(reported)) return reported;
  return mimeTypeFromFileName(file.name);
}

export function isAllowedUploadMimeType(mime: string): boolean {
  return ALLOWED_PHOTO_UPLOAD_MIME_TYPES.includes(mime);
}

export function isHeicMimeType(mime: string | null | undefined): boolean {
  return mime === "image/heic" || mime === "image/heif";
}

export type UploadFileKind = "image" | "video" | "other";

export function getUploadFileKind(mime: string): UploadFileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

/**
 * Re-wrap a File so `file.type` carries the effective MIME. Downstream code
 * (browser-image-compression, <img> previews, the storage contentType) all
 * read `file.type`, so an octet-stream HEIC must be corrected once, up front.
 */
export function withEffectiveMimeType(file: File): File {
  const effective = getEffectiveMimeType(file);
  if (!effective || effective === file.type) return file;
  return new File([file], file.name, { type: effective, lastModified: file.lastModified });
}

/** Swap the filename extension (keeps the base name). */
export function replaceFileExtension(fileName: string, newExt: string): string {
  const idx = fileName.lastIndexOf(".");
  const base = idx > 0 ? fileName.slice(0, idx) : fileName;
  return `${base}.${newExt}`;
}

/**
 * Convert a HEIC/HEIF file to JPEG in the browser. Only Safari can decode
 * HEIC natively, so anything stored as HEIC is a broken image everywhere
 * else — convert before upload. Throws if conversion fails; callers decide
 * whether to fall back to uploading the original.
 *
 * `heic2any` is imported lazily: it touches browser globals at load time and
 * pulls in a ~1MB libheif WASM bundle we don't want in the SSR graph.
 */
export async function convertHeicToJpeg(file: File, quality = 0.9): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("HEIC conversion produced no output");
  return new File([blob], replaceFileExtension(file.name, "jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

/**
 * iOS hands us a tiny proxy file when a photo hasn't been downloaded from
 * iCloud. Flag only genuinely implausible files: under ~2 KB, or a decoded
 * image whose byte count is absurdly low for its pixel dimensions. A normal
 * 800×600 JPEG is ~25–40 KB (≈0.06 bytes/px) and must NOT trip this.
 */
export const ICLOUD_PLACEHOLDER_MIN_BYTES = 2 * 1024;
export const ICLOUD_PLACEHOLDER_MIN_BYTES_PER_PIXEL = 0.02;

export function looksLikeICloudPlaceholder(
  file: Pick<File, "size">,
  dims?: { width: number; height: number } | null,
): boolean {
  if (file.size < ICLOUD_PLACEHOLDER_MIN_BYTES) return true;
  if (dims && dims.width > 0 && dims.height > 0) {
    return file.size / (dims.width * dims.height) < ICLOUD_PLACEHOLDER_MIN_BYTES_PER_PIXEL;
  }
  return false;
}
