import imageCompression from "browser-image-compression";

/**
 * Compress an image file to < 500 KB for field-use upload on poor cell coverage.
 * Preserves EXIF GPS data (important for location tagging).
 */
export async function compressPhoto(file: File): Promise<File> {
  // Skip compression for non-image or already-small files
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 500 * 1024) return file;

  const options = {
    maxSizeMB: 0.5,           // 500 KB hard target
    maxWidthOrHeight: 2048,   // enough for annotation detail on a tablet
    useWebWorker: true,
    preserveExif: true,       // keep GPS coords in EXIF
    fileType: file.type === "image/png" ? "image/png" : "image/jpeg",
    initialQuality: 0.85,
  };

  try {
    return await imageCompression(file, options);
  } catch {
    // If compression fails, return original rather than blocking upload
    return file;
  }
}

/**
 * Read an image file into a data URL for preview rendering.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Extract GPS coordinates from a File's EXIF data via the browser.
 * Returns null if unavailable (e.g. screenshots, non-GPS cameras).
 */
export async function extractGPS(
  file: File,
): Promise<{ lat: number; lng: number } | null> {
  try {
    // Use Geolocation API as primary source (more reliable on mobile)
    if ("geolocation" in navigator) {
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 3000, maximumAge: 60_000 },
        );
      });
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the pixel dimensions of an image File without loading the full image into DOM.
 */
export function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image dimensions"));
    };
    img.src = url;
  });
}
