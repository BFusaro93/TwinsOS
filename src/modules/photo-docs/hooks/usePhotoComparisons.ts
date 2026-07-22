"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { PhotoComparison } from "../types/photo.types";
import { getOriginalUrl, getAnnotatedUrl } from "../lib/photoStorage";

// photo_comparisons table added by the photo-docs migration — not yet in generated types.
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapComparison(row: Record<string, any>): PhotoComparison {
  return {
    id: row.id, orgId: row.org_id, photoJobId: row.photo_job_id,
    beforePhotoId: row.before_photo_id, afterPhotoId: row.after_photo_id,
    label: row.label ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null, createdBy: row.created_by ?? null,
  };
}

function mapPhotoRow(row: Record<string, any>) {
  return {
    id: row.id, orgId: row.org_id, photoJobId: row.photo_job_id,
    uploadedBy: row.uploaded_by, uploadedByName: row.uploaded_by_name,
    displayName: row.display_name ?? null,
    storagePath: row.storage_path, annotatedPath: row.annotated_path ?? null,
    thumbnailPath: row.thumbnail_path ?? null, fileName: row.file_name,
    fileSize: row.file_size, mimeType: row.mime_type,
    width: row.width ?? null, height: row.height ?? null,
    beforeAfter: row.before_after ?? "none", tags: row.tags ?? [],
    notes: row.notes ?? null, gpsLat: row.gps_lat ?? null, gpsLng: row.gps_lng ?? null,
    uploadContext: row.upload_context ?? "other", hasAnnotations: row.has_annotations ?? false,
    createdAt: row.created_at, updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null, createdBy: row.created_by ?? null,
  };
}

export function useJobPhotoComparisons(photoJobId: string) {
  return useQuery({
    queryKey: ["photo-comparisons", photoJobId],
    queryFn: async () => {
      const db = createClient() as any;
      const { data, error } = await db
        .from("photo_comparisons")
        .select("*, before_photo:job_photos!photo_comparisons_before_photo_id_fkey(*), after_photo:job_photos!photo_comparisons_after_photo_id_fkey(*)")
        .eq("photo_job_id", photoJobId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const comparisons = ((data ?? []) as Record<string, any>[]).map((row) => {
        const comparison = mapComparison(row);
        const beforePhoto = row.before_photo ? mapPhotoRow(row.before_photo) : undefined;
        const afterPhoto = row.after_photo ? mapPhotoRow(row.after_photo) : undefined;
        return { comparison, beforePhoto, afterPhoto };
      });
      return Promise.all(comparisons.map(async ({ comparison, beforePhoto, afterPhoto }) => ({
        ...comparison,
        beforePhoto: beforePhoto && {
          ...beforePhoto,
          publicUrl: (await getOriginalUrl(beforePhoto.storagePath)) ?? undefined,
          annotatedUrl: beforePhoto.annotatedPath ? (await getAnnotatedUrl(beforePhoto.annotatedPath)) ?? undefined : undefined,
        },
        afterPhoto: afterPhoto && {
          ...afterPhoto,
          publicUrl: (await getOriginalUrl(afterPhoto.storagePath)) ?? undefined,
          annotatedUrl: afterPhoto.annotatedPath ? (await getAnnotatedUrl(afterPhoto.annotatedPath)) ?? undefined : undefined,
        },
      })));
    },
    enabled: !!photoJobId,
    staleTime: 30_000,
  });
}

export function useCreatePhotoComparison(photoJobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ beforePhotoId, afterPhotoId, label }: { beforePhotoId: string; afterPhotoId: string; label?: string | null }) => {
      const db = createClient() as any;
      const { data: { user } } = await db.auth.getUser();
      const { data: profile } = await db.from("profiles").select("org_id").eq("id", user!.id).single();
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org_id found");
      const { error } = await db.from("photo_comparisons").insert({
        org_id: orgId,
        photo_job_id: photoJobId,
        before_photo_id: beforePhotoId,
        after_photo_id: afterPhotoId,
        label: label ?? null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photo-comparisons", photoJobId] }); },
  });
}

export function useDeletePhotoComparison(photoJobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (comparisonId: string) => {
      const db = createClient() as any;
      const { error } = await db.from("photo_comparisons")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", comparisonId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photo-comparisons", photoJobId] }); },
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
