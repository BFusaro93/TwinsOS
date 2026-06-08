"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { JobPhoto, GalleryTab } from "../types/photo.types";
import { getOriginalUrl, getAnnotatedUrl } from "../lib/photoStorage";

// job_photos table added by photo-docs migration — not yet in generated types.
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapPhoto(row: Record<string, any>): JobPhoto {
  return {
    id: row.id, orgId: row.org_id, photoJobId: row.photo_job_id,
    uploadedBy: row.uploaded_by, uploadedByName: row.uploaded_by_name,
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

export function useJobPhotos(projectId: string, tab: GalleryTab = "all") {
  return useQuery({
    queryKey: ["job-photos", projectId, tab],
    queryFn: async () => {
      const db = createClient() as any;
      let q = db.from("job_photos").select("*").eq("photo_job_id", projectId)
        .is("deleted_at", null).order("created_at", { ascending: false });
      if (tab === "before") q = q.eq("before_after", "before");
      if (tab === "after") q = q.eq("before_after", "after");
      if (tab === "annotated") q = q.eq("has_annotations", true);
      const { data, error } = await q;
      if (error) throw error;
      const photos = ((data ?? []) as Record<string, any>[]).map(mapPhoto);
      return Promise.all(photos.map(async (p) => ({
        ...p,
        publicUrl: (await getOriginalUrl(p.storagePath)) ?? undefined,
        annotatedUrl: p.annotatedPath ? (await getAnnotatedUrl(p.annotatedPath)) ?? undefined : undefined,
      })));
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useJobPhoto(photoId: string | null) {
  return useQuery({
    queryKey: ["job-photo", photoId],
    queryFn: async () => {
      if (!photoId) return null;
      const db = createClient() as any;
      const { data, error } = await db.from("job_photos").select("*")
        .eq("id", photoId).is("deleted_at", null).single();
      if (error) throw error;
      const photo = mapPhoto(data);
      return {
        ...photo,
        publicUrl: (await getOriginalUrl(photo.storagePath)) ?? undefined,
        annotatedUrl: photo.annotatedPath ? (await getAnnotatedUrl(photo.annotatedPath)) ?? undefined : undefined,
      };
    },
    enabled: !!photoId,
  });
}

export function useDeletePhoto(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      const db = createClient() as any;
      const { error } = await db.from("job_photos").update({ deleted_at: new Date().toISOString() }).eq("id", photoId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-photos", projectId] }); },
  });
}

export function useUpdatePhoto(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, beforeAfter, tags, notes }: { id: string; beforeAfter?: JobPhoto["beforeAfter"]; tags?: string[]; notes?: string | null; }) => {
      const db = createClient() as any;
      const { error } = await db.from("job_photos").update({
        ...(beforeAfter !== undefined && { before_after: beforeAfter }),
        ...(tags !== undefined && { tags }),
        ...(notes !== undefined && { notes }),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["job-photos", projectId] });
      qc.invalidateQueries({ queryKey: ["job-photo", id] });
    },
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
