"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores";
import type { PhotoJob, PhotoJobStatus } from "../types/photo.types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapPhotoJob(row: Record<string, any>): PhotoJob {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    customerName: row.customer_name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? "",
    notes: row.notes ?? null,
    status: (row.status ?? "active") as PhotoJobStatus,
    isArchived: row.is_archived === true,
    projectId: row.project_id ?? null,
    clientId: row.client_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    createdBy: row.created_by ?? null,
  };
}

export function usePhotoJobs(statusFilter?: PhotoJobStatus | "all", includeArchived = false) {
  return useQuery({
    queryKey: ["photo-jobs", statusFilter ?? "all", { includeArchived }],
    queryFn: async () => {
      const db = createClient() as any;
      let q = db.from("photo_jobs").select("*").is("deleted_at", null).order("name");
      if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);
      if (!includeArchived) q = q.eq("is_archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Record<string, any>[]).map(mapPhotoJob);
    },
  });
}

export function usePhotoJob(id: string | null) {
  return useQuery({
    queryKey: ["photo-jobs", id],
    queryFn: async () => {
      if (!id) return null;
      const db = createClient() as any;
      const { data, error } = await db.from("photo_jobs").select("*").eq("id", id).is("deleted_at", null).single();
      if (error) throw error;
      return mapPhotoJob(data);
    },
    enabled: !!id,
  });
}

export function usePhotoJobByProjectId(projectId: string | null) {
  return useQuery({
    queryKey: ["photo-jobs", "by-project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const db = createClient() as any;
      const { data, error } = await db
        .from("photo_jobs")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPhotoJob(data) : null;
    },
    enabled: !!projectId,
  });
}

export function useCreatePhotoJob() {
  const qc = useQueryClient();
  const { currentUser } = useCurrentUserStore();
  return useMutation({
    mutationFn: async (input: { name: string; customerName: string; address: string; city: string; state: string; zip: string; notes?: string; projectId?: string; clientId?: string }) => {
      const db = createClient() as any;
      const { data: profile } = await db.from("profiles").select("org_id").eq("id", currentUser.id).single();
      const { data, error } = await db.from("photo_jobs").insert({
        org_id: profile.org_id,
        name: input.name,
        customer_name: input.customerName,
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        notes: input.notes ?? null,
        project_id: input.projectId ?? null,
        client_id: input.clientId ?? null,
        created_by: currentUser.id,
      }).select().single();
      if (error) throw error;
      return mapPhotoJob(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-jobs"] });
      qc.invalidateQueries({ queryKey: ["client-photo-jobs"] });
    },
  });
}

export function useUpdatePhotoJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; customerName?: string; address?: string; city?: string; state?: string; zip?: string; notes?: string | null; status?: PhotoJobStatus; projectId?: string | null; clientId?: string | null }) => {
      const db = createClient() as any;
      const { error } = await db.from("photo_jobs").update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.customerName !== undefined && { customer_name: input.customerName }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.state !== undefined && { state: input.state }),
        ...(input.zip !== undefined && { zip: input.zip }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.projectId !== undefined && { project_id: input.projectId }),
        ...(input.clientId !== undefined && { client_id: input.clientId }),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["photo-jobs"] });
      qc.invalidateQueries({ queryKey: ["photo-jobs", id] });
    },
  });
}

export function useArchivePhotoJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const db = createClient() as any;
      const { error } = await db.from("photo_jobs").update({ is_archived: archived, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photo-jobs"] }),
  });
}

export function useDeletePhotoJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = createClient() as any;
      const { error } = await db.from("photo_jobs").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photo-jobs"] }),
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */
