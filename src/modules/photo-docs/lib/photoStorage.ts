import { createClient } from "@/lib/supabase/client";

const ORIGINALS_BUCKET = "job-photos-original";
const ANNOTATED_BUCKET = "job-photos-annotated";

/**
 * Build the storage path for a new photo upload.
 * Format: {orgId}/{projectId}/{timestamp}-{random}.{ext}
 */
export function buildPhotoPath(
  orgId: string,
  projectId: string,
  fileName: string,
): string {
  // fileName is a browser File.name, which a crafted client can set to
  // anything (including "/" and ".." segments) — restrict the extracted
  // extension to a safe charset before it lands in a storage path, or a
  // crafted name could traverse out of this org/project's prefix in the
  // shared bucket (same class of bug fixed in the crew-app photos route).
  const rawExt = fileName.split(".").pop() ?? "jpg";
  const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : "jpg";
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${orgId}/${projectId}/${ts}-${rand}.${ext}`;
}

/**
 * Upload a compressed photo file to the originals bucket.
 * Accepts an optional pre-authenticated supabase client to avoid
 * creating a second client instance that might miss the auth session.
 * Returns the storage path on success.
 */
export async function uploadOriginalPhoto(
  path: string,
  file: File,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
): Promise<string> {
  const supabase = supabaseClient ?? createClient();
  const contentType = file.type || "application/octet-stream";

  // Safari rejects fetch uploads with File objects directly (StorageUnknownError: Load failed).
  // Converting to ArrayBuffer first works around this Safari bug.
  const buffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(ORIGINALS_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) {
    console.error("[uploadOriginalPhoto] Storage error:", error);
    throw new Error(`Storage upload failed: ${error.message ?? JSON.stringify(error)}`);
  }
  return path;
}

/**
 * Upload a composite annotated PNG (rendered from Fabric.js canvas) to the
 * annotated bucket. Uses upsert so re-saving annotations replaces the file.
 */
export async function uploadAnnotatedPhoto(
  path: string,
  blob: Blob,
): Promise<string> {
  const supabase = createClient();
  // Convert Blob to ArrayBuffer to avoid Safari fetch bug
  const buffer = await blob.arrayBuffer();
  const { error } = await supabase.storage
    .from(ANNOTATED_BUCKET)
    .upload(path, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Annotated upload failed: ${error.message}`);
  return path;
}

/**
 * Generate a short-lived signed URL for a photo (1 hour TTL).
 * Always generate at read time — never store the signed URL in the DB.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Get a signed URL for an original photo.
 */
export async function getOriginalUrl(path: string): Promise<string | null> {
  return getSignedUrl(ORIGINALS_BUCKET, path);
}

/**
 * Get a signed URL for an annotated composite.
 */
export async function getAnnotatedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  return getSignedUrl(ANNOTATED_BUCKET, path);
}

/**
 * Soft-delete a photo from storage.
 * We don't hard-delete storage objects when soft-deleting DB records —
 * storage cleanup is a separate admin task. This is intentional.
 */
export async function deletePhotoFromStorage(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(ORIGINALS_BUCKET).remove([path]);
}

export { ORIGINALS_BUCKET, ANNOTATED_BUCKET };
