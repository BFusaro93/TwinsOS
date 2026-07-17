"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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

export function useCreateCampaign() {
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
          scheduled_at: values.scheduledAt || null,
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
      if (updates.scheduledAt !== undefined) patch.scheduled_at = updates.scheduledAt || null;
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
