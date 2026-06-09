"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { compressPhoto, getImageDimensions, extractGPS } from "../lib/imageCompression";
import { buildPhotoPath, uploadOriginalPhoto } from "../lib/photoStorage";
import type { PhotoUploadInput, PhotoUploadProgress } from "../types/photo.types";

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
          const isImage = inp.file.type.startsWith("image/");

          // 1. Compress images only; pass other file types straight through
          updateStatus("compressing");
          const compressed = isImage ? await compressPhoto(inp.file) : inp.file;

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
          const path = buildPhotoPath(orgId, projectId, inp.file.name);
          await uploadOriginalPhoto(path, compressed, supabase);

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
            mime_type: compressed.type || inp.file.type,
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
