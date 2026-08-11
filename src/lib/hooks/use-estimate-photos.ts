"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface EstimatePhoto {
  id: string;
  estimateId: string;
  storagePath: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  caption: string | null;
  customerFacing: boolean;
  createdAt: string;
  signedUrl: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapPhoto(row: Record<string, any>): EstimatePhoto {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    storagePath: row.storage_path,
    fileName: row.file_name ?? "",
    fileSize: row.file_size ?? null,
    mimeType: row.mime_type ?? null,
    caption: row.caption ?? null,
    customerFacing: row.customer_facing ?? false,
    createdAt: row.created_at,
    signedUrl: row.signedUrl ?? null,
  };
}

export function useEstimatePhotos(estimateId: string) {
  return useQuery({
    queryKey: ["estimate-photos", estimateId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/estimates/${estimateId}/photos`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load photos");
      const rows = (await res.json()) as Record<string, any>[];
      return rows.map(mapPhoto);
    },
    enabled: !!estimateId,
  });
}

export function useUploadEstimatePhoto(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const results = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch(`/api/crm/estimates/${estimateId}/photos`, {
            method: "POST",
            body: formData,
          });
          return { ok: res.ok, fileName: file.name };
        })
      );
      return results;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["estimate-photos", estimateId] }),
  });
}

export function useUpdateEstimatePhotoCaption(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photoId, caption }: { photoId: string; caption: string }) => {
      const res = await fetch(`/api/crm/estimates/${estimateId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update caption");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["estimate-photos", estimateId] }),
  });
}

export function useUpdateEstimatePhotoVisibility(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photoId, customerFacing }: { photoId: string; customerFacing: boolean }) => {
      const res = await fetch(`/api/crm/estimates/${estimateId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerFacing }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update photo visibility");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["estimate-photos", estimateId] }),
  });
}

export function useDeleteEstimatePhoto(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      const res = await fetch(`/api/crm/estimates/${estimateId}/photos/${photoId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete photo");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["estimate-photos", estimateId] }),
  });
}
