"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores";
import { uploadAnnotatedPhoto } from "../lib/photoStorage";
import type { PhotoAnnotation } from "../types/photo.types";

// photo_annotations / job_photos added by migration — not yet in generated types.
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapAnnotation(row: Record<string, any>): PhotoAnnotation {
  return {
    id: row.id, orgId: row.org_id, photoId: row.photo_id,
    authorId: row.author_id, authorName: row.author_name,
    fabricJson: row.fabric_json as Record<string, unknown>,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function usePhotoAnnotation(photoId: string | null) {
  return useQuery({
    queryKey: ["photo-annotation", photoId],
    queryFn: async () => {
      if (!photoId) return null;
      const db = createClient() as any;
      const { data, error } = await db.from("photo_annotations").select("*")
        .eq("photo_id", photoId).maybeSingle();
      if (error) throw error;
      return data ? mapAnnotation(data) : null;
    },
    enabled: !!photoId,
  });
}

export function useClearAnnotation(photoId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const db = createClient() as any;
      const { error: annErr } = await db.from("photo_annotations")
        .delete().eq("photo_id", photoId);
      if (annErr) throw annErr;
      const { error: photoErr } = await db.from("job_photos").update({
        has_annotations: false, annotated_path: null,
        updated_at: new Date().toISOString(),
      }).eq("id", photoId);
      if (photoErr) throw photoErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-annotation", photoId] });
      qc.invalidateQueries({ queryKey: ["job-photo", photoId] });
      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
    },
  });
}

export function useSaveAnnotation(photoId: string, projectId: string) {
  const qc = useQueryClient();
  const { currentUser } = useCurrentUserStore();
  return useMutation({
    mutationFn: async ({ fabricJson, compositeBlob, orgId }: { fabricJson: Record<string, unknown>; compositeBlob: Blob; orgId: string; }) => {
      const db = createClient() as any;
      const annotatedPath = `${orgId}/${projectId}/${photoId}-annotated.png`;
      await uploadAnnotatedPhoto(annotatedPath, compositeBlob);
      const { error: annErr } = await db.from("photo_annotations").upsert({
        photo_id: photoId, org_id: orgId,
        author_id: currentUser.id, author_name: currentUser.name,
        fabric_json: fabricJson, updated_at: new Date().toISOString(),
      }, { onConflict: "photo_id" });
      if (annErr) throw annErr;
      const { error: photoErr } = await db.from("job_photos").update({
        has_annotations: true, annotated_path: annotatedPath,
        updated_at: new Date().toISOString(),
      }).eq("id", photoId);
      if (photoErr) throw photoErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-annotation", photoId] });
      qc.invalidateQueries({ queryKey: ["job-photo", photoId] });
      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
    },
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
