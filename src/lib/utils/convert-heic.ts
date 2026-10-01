/**
 * Server-side HEIC/HEIF -> JPEG conversion (pure JS/wasm via heic-convert;
 * sharp's prebuilt binaries cannot decode HEIC). The library is imported
 * dynamically inside the function so it never loads unless a HEIC arrives.
 */

export const HEIC_MAX_BYTES = 15 * 1024 * 1024;
export const HEIC_ERROR_MESSAGE = "Could not read this HEIC photo — export it as JPEG";

const HEIC_MIMES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const GENERIC_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/** True for HEIC/HEIF by MIME, or by extension when the MIME is empty/generic. */
export function isHeic(file: { type?: string | null; name?: string | null }): boolean {
  const mime = (file.type ?? "").toLowerCase();
  if (HEIC_MIMES.has(mime)) return true;
  if (!GENERIC_MIMES.has(mime)) return false;
  return /\.(heic|heif)$/i.test(file.name ?? "");
}

/** Convert a HEIC/HEIF buffer to a JPEG buffer (quality 85). Throws on failure. */
export async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > HEIC_MAX_BYTES) throw new Error("HEIC file too large");
  const { default: convert } = await import("heic-convert");
  const out = await convert({ buffer, format: "JPEG", quality: 0.85 });
  return Buffer.from(out);
}

/** Replace a filename's extension with .jpg. */
export function toJpgName(name: string): string {
  const idx = name.lastIndexOf(".");
  return `${idx > 0 ? name.slice(0, idx) : name}.jpg`;
}
