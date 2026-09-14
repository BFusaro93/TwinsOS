"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { compressPhoto, getImageDimensions, extractGPS } from "../lib/imageCompression";
import { buildPhotoPath, uploadOriginalPhoto } from "../lib/photoStorage";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  ALLOWED_PHOTO_UPLOAD_MIME_TYPES,
  getEffectiveMimeType,
  isAllowedUploadMimeType,
  isHeicMimeType,
  withEffectiveMimeType,
  convertHeicToJpeg,
} from "../lib/fileType";
import { logger } from "@/lib/logger";
import type { PhotoUploadInput, PhotoUploadProgress } from "../types/photo.types";

// Re-exported so existing imports keep working; the source of truth (and the
// extension-based MIME fallback) lives in ../lib/fileType.ts.
export { MAX_PHOTO_UPLOAD_BYTES, ALLOWED_PHOTO_UPLOAD_MIME_TYPES };

const log = logger.child("photo-upload");

export function usePhotoUpload(projectId: string) {
  const qc = useQueryClient();
  const { currentUser } = useCurrentUserStore();
  const [progress, setProgress] = useState<PhotoUploadProgress[]>([]);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (inputs: PhotoUploadInput[]): Promise<void> => {
      if (inputs.length === 0) return;
      setUploading(true);

      // Initialise progress tracking
      setProgress(
        inputs.map((inp, i) => ({
          fileIndex: i,
          total: inputs.length,
          fileName: inp.file.name,
          status: "compressing",
        })),
      );

      const supabase = createClient();

      // Get org_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", currentUser.id)
        .single();
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org_id found");

      for (let i = 0; i < inputs.length; i++) {
        const inp = inputs[i];
        const updateStatus = (
          status: PhotoUploadProgress["status"],
          errorMessage?: string,
        ) =>
          setProgress((prev) =>
            prev.map((p) => (p.fileIndex === i ? { ...p, status, errorMessage } : p)),
          );

        try {
          // 0. Validate size/type client-side so the user gets a clear
          // message instead of a generic Storage API rejection. Limits
          // must match the job-photos-* bucket config (see the constants
          // above and the migration they reference).
          if (inp.file.size > MAX_PHOTO_UPLOAD_BYTES) {
            throw new Error(
              `"${inp.file.name}" is too large (${(inp.file.size / (1024 * 1024)).toFixed(1)}MB). Max file size is ${MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)}MB.`,
            );
          }
          // Validate against the EFFECTIVE type: Chrome reports HEIC as
          // application/octet-stream (or "") on several platforms, so the
          // raw file.type can't be trusted — fall back to the extension.
          const effectiveType = getEffectiveMimeType(inp.file);
          if (!effectiveType || !isAllowedUploadMimeType(effectiveType)) {
            throw new Error(
              `"${inp.file.name}" has an unsupported file type (${inp.file.type || "unknown"}). Allowed: photos, short videos, and common documents.`,
            );
          }

          // Normalise file.type so compression / dimension probing / storage
          // contentType all see the real MIME instead of octet-stream.
          let workingFile = withEffectiveMimeType(inp.file);
          const isImage = effectiveType.startsWith("image/");

          // 0b. HEIC/HEIF → JPEG in the browser. Only Safari can decode HEIC,
          // so a raw HEIC in storage renders as a broken image for everyone
          // else. If conversion fails we still upload the original (the
          // gallery/lightbox show a "preview not available" placeholder for
          // image/heic rather than a broken <img>).
          if (isHeicMimeType(effectiveType)) {
            updateStatus("compressing");
            try {
              workingFile = await convertHeicToJpeg(workingFile);
            } catch (convErr) {
              log.warn("HEIC conversion failed; uploading original", {
                fileName: inp.file.name,
                error: convErr instanceof Error ? convErr.message : String(convErr),
              });
            }
          }

          // 1. Compress images only; pass other file types straight through.
          //    Runs on the converted JPEG when a HEIC was converted above.
          updateStatus("compressing");
          const compressed = isImage ? await compressPhoto(workingFile) : workingFile;
          const uploadContentType = compressed.type || workingFile.type || effectiveType;

          // 2. Dimensions — images only
          const dims = isImage ? await getImageDimensions(compressed).catch(() => null) : null;

          // 3. GPS — images only
          let gpsLat = inp.gpsLat ?? null;
          let gpsLng = inp.gpsLng ?? null;
          if (isImage && gpsLat == null) {
            const gps = await extractGPS(compressed);
            gpsLat = gps?.lat ?? null;
            gpsLng = gps?.lng ?? null;
          }

          // 4. Upload to storage
          updateStatus("uploading");
          // Path extension follows the file we actually store (.jpg after a
          // HEIC conversion); file_name below keeps the user's original name.
          const path = buildPhotoPath(orgId, projectId, compressed.name);
          await uploadOriginalPhoto(path, compressed, supabase, uploadContentType);

          // 5. Save metadata to DB
          updateStatus("saving");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("job_photos").insert({
            org_id: orgId,
            photo_job_id: projectId,
            uploaded_by: currentUser.id,
            uploaded_by_name: currentUser.name,
            display_name: inp.displayName ?? null,
            storage_path: path,
            file_name: inp.file.name,
            file_size: compressed.size,
            mime_type: uploadContentType,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            before_after: inp.beforeAfter,
            tags: inp.tags,
            notes: inp.notes ?? null,
            gps_lat: gpsLat,
            gps_lng: gpsLng,
            upload_context: inp.uploadContext,
            created_by: currentUser.id,
          });
          if (error) throw error;

          updateStatus("done");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          updateStatus("error", msg);
        }
      }

      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
      setUploading(false);
    },
    [currentUser, projectId, qc],
  );

  const reset = useCallback(() => {
    setProgress([]);
    setUploading(false);
  }, []);

  return { upload, progress, uploading, reset };
}
