"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { zoneWallClockToInstant } from "@/lib/time/zone";
import type {
  CRMCampaign,
  CampaignStatus,
  NewCampaignFormValues,
  SendCampaignResult,
} from "@/types/crm-campaigns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCampaign(row: any): CRMCampaign {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    status: row.status,
    type: row.type,
    targetSegment: row.target_segment,
    subject: row.subject,
    body: row.body,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    totalRecipients: row.total_recipients ?? 0,
    deliveredCount: row.delivered_count ?? 0,
    openedCount: row.opened_count ?? 0,
    clickedCount: row.clicked_count ?? 0,
    unsubscribedCount: row.unsubscribed_count ?? 0,
    audienceClientIds: row.audience_client_ids ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function useCampaigns(statusFilter?: CampaignStatus | "all") {
  return useQuery({
    queryKey: ["crm-campaigns", statusFilter],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_campaigns")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapCampaign);
    },
  });
}

/**
 * The Schedule Send field is a datetime-local ("2026-10-20T09:00") — a wall
 * clock with no zone. Saved as-is, Postgres read it as UTC, so a 9:00 AM send
 * went out at 5:00 AM Eastern (and the list showed 5:00 AM). Read it on the
 * ORG's clock, like the sales-meeting reminders do, and store the real instant.
 */
function scheduledWallToInstantIso(value: string | null | undefined, timeZone: string): string | null {
  if (!value) return null;
  // Already an instant (has a zone designator after the time) — leave it.
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value.slice(10))) return value;
  const [date, time] = value.split("T");
  return zoneWallClockToInstant(date, time ?? "00:00", timeZone)?.toISOString() ?? null;
}

export function useCreateCampaign() {
  const orgTimeZone = useOrgTimeZone();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewCampaignFormValues) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_campaigns")
        .insert({
          name: values.name,
          type: values.type,
          target_segment: values.targetSegment,
          subject: values.subject || null,
          body: values.body || null,
          scheduled_at: scheduledWallToInstantIso(values.scheduledAt, orgTimeZone),
          audience_client_ids: values.audienceClientIds ?? [],
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return mapCampaign(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-campaigns"] }),
  });
}

export function useUpdateCampaign() {
  const orgTimeZone = useOrgTimeZone();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<NewCampaignFormValues> & { status?: CampaignStatus };
    }) => {
      const supabase = createClient();
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.type !== undefined) patch.type = updates.type;
      if (updates.targetSegment !== undefined) patch.target_segment = updates.targetSegment;
      if (updates.subject !== undefined) patch.subject = updates.subject || null;
      if (updates.body !== undefined) patch.body = updates.body || null;
      if (updates.scheduledAt !== undefined) patch.scheduled_at = scheduledWallToInstantIso(updates.scheduledAt, orgTimeZone);
      if (updates.audienceClientIds !== undefined) patch.audience_client_ids = updates.audienceClientIds;
      if (updates.status !== undefined) patch.status = updates.status;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_campaigns")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapCampaign(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-campaigns"] }),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<SendCampaignResult> => {
      const res = await fetch(`/api/crm/campaigns/${id}/send`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send campaign");
      return json as SendCampaignResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-campaigns"] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_campaigns")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-campaigns"] }),
  });
}
