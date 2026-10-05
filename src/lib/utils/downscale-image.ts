/**
 * Browser-side downscale for photo uploads. Vercel rejects request bodies over
 * ~4.5MB (413, HTML body), and a single iPhone photo is routinely 3-8MB, so
 * big images are re-encoded as JPEG before they are POSTed through a route.
 * Falls back to the original file whenever the browser can't decode it.
 */

const MAX_EDGE = 2400;
const TARGET_BYTES = 3 * 1024 * 1024;

export async function downscaleImage(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (blob && blob.size <= TARGET_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    return file;
  } catch {
    return file;
  }
}
