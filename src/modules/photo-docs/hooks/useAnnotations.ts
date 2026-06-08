"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores";
import { uploadAnnotatedPhoto } from "../lib/photoStorage";
import type { PhotoAnnotation } from "../types/photo.types";

// ── Mapper ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAnnotation(row: Record<string, any>): PhotoAnnotation {
  return {
    id: row.id,
    orgId: row.org_id,
    photoId: row.photo_id,
    authorId: row.author_id,
    authorName: row.author_name,
    fabricJson: row.fabric_json as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetch existing annotation JSON for a photo (if any).
 */
export function usePhotoAnnotation(photoId: string | null) {
  return useQuery({
    queryKey: ["photo-annotation", photoId],
    queryFn: async () => {
      if (!photoId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("photo_annotations" as any)
        .select("*")
        .eq("photo_id", photoId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAnnotation(data) : null;
    },
    enabled: !!photoId,
  });
}

/**
 * Save (upsert) annotation JSON + render composite PNG to annotated bucket.
 */
export function useSaveAnnotation(photoId: string, projectId: string) {
  const qc = useQueryClient();
  const { currentUser } = useCurrentUserStore();

  return useMutation({
    mutationFn: async ({
      fabricJson,
      compositeBlob,
      orgId,
    }: {
      fabricJson: Record<string, unknown>;
      compositeBlob: Blob;
      orgId: string;
    }) => {
      const supabase = createClient();

      // 1. Upload composite PNG to annotated bucket
      const annotatedPath = `${orgId}/${projectId}/${photoId}-annotated.png`;
      await uploadAnnotatedPhoto(annotatedPath, compositeBlob);

      // 2. Upsert annotation record
      const { error: annErr } = await supabase
        .from("photo_annotations" as any)
        .upsert(
          {
            photo_id: photoId,
            org_id: orgId,
            author_id: currentUser.id,
            author_name: currentUser.name,
            fabric_json: fabricJson,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "photo_id" },
        );
      if (annErr) throw annErr;

      // 3. Update job_photos to reflect annotation state
      const { error: photoErr } = await supabase
        .from("job_photos" as any)
        .update({
          has_annotations: true,
          annotated_path: annotatedPath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", photoId);
      if (photoErr) throw photoErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-annotation", photoId] });
      qc.invalidateQueries({ queryKey: ["job-photo", photoId] });
      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
    },
  });
}
