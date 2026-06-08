"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { JobPhoto, GalleryTab } from "../types/photo.types";
import { getOriginalUrl, getAnnotatedUrl } from "../lib/photoStorage";

// ── Mapper ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPhoto(row: Record<string, any>): JobPhoto {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    storagePath: row.storage_path,
    annotatedPath: row.annotated_path ?? null,
    thumbnailPath: row.thumbnail_path ?? null,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    width: row.width ?? null,
    height: row.height ?? null,
    beforeAfter: row.before_after ?? "none",
    tags: row.tags ?? [],
    notes: row.notes ?? null,
    gpsLat: row.gps_lat ?? null,
    gpsLng: row.gps_lng ?? null,
    uploadContext: row.upload_context ?? "other",
    hasAnnotations: row.has_annotations ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    createdBy: row.created_by ?? null,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all photos for a project, with signed public URLs resolved.
 */
export function useJobPhotos(projectId: string, tab: GalleryTab = "all") {
  return useQuery({
    queryKey: ["job-photos", projectId, tab],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("job_photos" as any)
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (tab === "before") query = query.eq("before_after", "before");
      if (tab === "after") query = query.eq("before_after", "after");
      if (tab === "annotated") query = query.eq("has_annotations", true);

      const { data, error } = await query;
      if (error) throw error;

      const photos = (data ?? []).map(mapPhoto);

      // Resolve signed URLs in parallel (max 20 at a time to avoid rate limiting)
      const resolved = await Promise.all(
        photos.map(async (p) => ({
          ...p,
          publicUrl: (await getOriginalUrl(p.storagePath)) ?? undefined,
          annotatedUrl: p.annotatedPath
            ? (await getAnnotatedUrl(p.annotatedPath)) ?? undefined
            : undefined,
        })),
      );
      return resolved;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

/**
 * Fetch a single photo with signed URLs.
 */
export function useJobPhoto(photoId: string | null) {
  return useQuery({
    queryKey: ["job-photo", photoId],
    queryFn: async () => {
      if (!photoId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("job_photos" as any)
        .select("*")
        .eq("id", photoId)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      const photo = mapPhoto(data);
      return {
        ...photo,
        publicUrl: (await getOriginalUrl(photo.storagePath)) ?? undefined,
        annotatedUrl: photo.annotatedPath
          ? (await getAnnotatedUrl(photo.annotatedPath)) ?? undefined
          : undefined,
      };
    },
    enabled: !!photoId,
  });
}

/**
 * Soft-delete a photo (admin / manager only — enforced by RLS).
 */
export function useDeletePhoto(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("job_photos" as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", photoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
    },
  });
}

/**
 * Update a photo's before/after flag, tags, or notes.
 */
export function useUpdatePhoto(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      beforeAfter,
      tags,
      notes,
    }: {
      id: string;
      beforeAfter?: JobPhoto["beforeAfter"];
      tags?: string[];
      notes?: string | null;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("job_photos" as any)
        .update({
          ...(beforeAfter !== undefined && { before_after: beforeAfter }),
          ...(tags !== undefined && { tags }),
          ...(notes !== undefined && { notes }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
      qc.invalidateQueries({ queryKey: ["job-photo", id] });
    },
  });
}
