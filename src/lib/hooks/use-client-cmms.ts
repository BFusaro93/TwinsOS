"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProject } from "@/lib/supabase/mappers";
import type { Project } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Projects and photo jobs still reference customers via the informal
// customer_name string — the clients.id FK link is deferred until the CRM
// rollout — so these hooks match on the client's display name (plus
// projects.client_id where it happens to already be set).

export function useClientProjects(clientId: string, displayName: string) {
  return useQuery({
    queryKey: ["client-projects", clientId, displayName],
    queryFn: async () => {
      const db = createClient() as any;
      const [byId, byName] = await Promise.all([
        db.from("projects").select("*").eq("client_id", clientId).is("deleted_at", null),
        db.from("projects").select("*").ilike("customer_name", displayName).is("deleted_at", null),
      ]);
      if (byId.error) throw byId.error;
      if (byName.error) throw byName.error;
      const seen = new Set<string>();
      const rows = [...(byId.data ?? []), ...(byName.data ?? [])].filter((r: any) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      rows.sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      return rows.map((r: any) => mapProject(r)) as Project[];
    },
    enabled: !!clientId && !!displayName,
  });
}

export interface ClientPhotoJob {
  id: string;
  name: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: "active" | "complete" | "pending";
  isArchived: boolean;
  createdAt: string;
  photoCount: number;
}

export function useClientPhotoJobs(displayName: string) {
  return useQuery({
    queryKey: ["client-photo-jobs", displayName],
    queryFn: async () => {
      const db = createClient() as any;
      const { data, error } = await db
        .from("photo_jobs")
        .select("*")
        .ilike("customer_name", displayName)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const jobs = (data ?? []) as Record<string, any>[];

      // Photo counts are best-effort — environments without the job_photos
      // table (or its photo_job_id FK) just show 0
      const counts = new Map<string, number>();
      if (jobs.length) {
        const { data: photoRows } = await db
          .from("job_photos")
          .select("photo_job_id")
          .in("photo_job_id", jobs.map((j) => j.id))
          .is("deleted_at", null);
        for (const row of (photoRows ?? []) as Record<string, any>[]) {
          counts.set(row.photo_job_id, (counts.get(row.photo_job_id) ?? 0) + 1);
        }
      }

      return jobs.map((row): ClientPhotoJob => ({
        id: row.id,
        name: row.name,
        customerName: row.customer_name ?? "",
        address: row.address ?? "",
        city: row.city ?? "",
        state: row.state ?? "",
        zip: row.zip ?? "",
        status: (row.status ?? "active") as ClientPhotoJob["status"],
        isArchived: row.is_archived === true,
        createdAt: row.created_at,
        photoCount: counts.get(row.id) ?? 0,
      }));
    },
    enabled: !!displayName,
  });
}
