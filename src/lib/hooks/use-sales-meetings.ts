"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { SalesMeeting, SalesRepOption } from "@/types/crm-sales-meetings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMeeting(row: any): SalesMeeting {
  return {
    id: row.id,
    orgId: row.org_id,
    salesRepId: row.sales_rep_id,
    clientId: row.client_id,
    leadName: row.lead_name,
    title: row.title,
    meetingType: row.meeting_type,
    location: row.location,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    notes: row.notes,
    estimateId: row.estimate_id,
    ticketId: row.ticket_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export interface SalesMeetingWithClient extends SalesMeeting {
  clientName: string | null;
}

// ── sales reps ──────────────────────────────────────────────────────────────

export function useSalesReps() {
  return useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_employees")
        .select("id, first_name, last_name, map_icon_color")
        .eq("is_sales_rep", true)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("first_name", { ascending: true });
      if (error) throw error;
      return data.map((row): SalesRepOption => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        mapIconColor: row.map_icon_color,
      }));
    },
  });
}

// ── meetings ──────────────────────────────────────────────────────────────────

export function useSalesMeetings(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["sales-meetings", startDate, endDate],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_sales_meetings")
        .select("*, clients(display_name)")
        .is("deleted_at", null)
        .gte("scheduled_at", startDate)
        .lt("scheduled_at", endDate)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((row) => ({
        ...mapMeeting(row),
        clientName: row.clients?.display_name ?? null,
      })) as SalesMeetingWithClient[];
    },
    enabled: !!startDate && !!endDate,
  });
}

export interface NewSalesMeetingInput {
  salesRepId: string;
  clientId: string | null;
  leadName: string | null;
  title: string;
  meetingType: "in_person" | "phone" | "video";
  location: string | null;
  scheduledAt: string;
  durationMinutes: number;
  notes: string | null;
  estimateId: string | null;
  ticketId: string | null;
}

export function useCreateSalesMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewSalesMeetingInput) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("crm_sales_meetings")
        .insert({
          created_by: user?.id ?? null,
          sales_rep_id: values.salesRepId,
          client_id: values.clientId,
          lead_name: values.leadName,
          title: values.title,
          meeting_type: values.meetingType,
          location: values.location,
          scheduled_at: values.scheduledAt,
          duration_minutes: values.durationMinutes,
          notes: values.notes,
          estimate_id: values.estimateId,
          ticket_id: values.ticketId,
        })
        .select()
        .single();
      if (error) throw error;
      return mapMeeting(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-meetings"] });
    },
  });
}

export function useUpdateSalesMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<NewSalesMeetingInput> & { status?: string } }) => {
      const supabase = createClient();
      const patch: Record<string, unknown> = {};
      if (values.clientId !== undefined) patch.client_id = values.clientId;
      if (values.leadName !== undefined) patch.lead_name = values.leadName;
      if (values.title !== undefined) patch.title = values.title;
      if (values.meetingType !== undefined) patch.meeting_type = values.meetingType;
      if (values.location !== undefined) patch.location = values.location;
      if (values.scheduledAt !== undefined) {
        patch.scheduled_at = values.scheduledAt;
      }
      if (values.salesRepId !== undefined) {
        patch.sales_rep_id = values.salesRepId;
      }
      if (values.scheduledAt !== undefined || values.salesRepId !== undefined) {
        // The edit dialog always resubmits scheduledAt (recomputed from its
        // date/time fields) even when the user only changed something else
        // like notes — so only reset the reminder if the time or the
        // assigned rep is ACTUALLY changing, or every unrelated edit would
        // also re-arm (and duplicate-send) the reminder. The cron only
        // selects rows where reminder_sent_at is null, so a genuine
        // reschedule after the reminder already fired for the old time (or
        // a reassignment to a different rep after the original rep's
        // reminder already fired) needs this reset or nothing ever re-fires
        // for the new time / the new rep never gets notified.
        const { data: existing } = await supabase
          .from("crm_sales_meetings")
          .select("scheduled_at, sales_rep_id")
          .eq("id", id)
          .maybeSingle();
        const timeChanged =
          values.scheduledAt !== undefined &&
          existing &&
          new Date(existing.scheduled_at).getTime() !== new Date(values.scheduledAt).getTime();
        const repChanged =
          values.salesRepId !== undefined &&
          existing &&
          existing.sales_rep_id !== values.salesRepId;
        if (timeChanged || repChanged) {
          patch.reminder_sent_at = null;
        }
      }
      if (values.durationMinutes !== undefined) patch.duration_minutes = values.durationMinutes;
      if (values.notes !== undefined) patch.notes = values.notes;
      if (values.estimateId !== undefined) patch.estimate_id = values.estimateId;
      if (values.ticketId !== undefined) patch.ticket_id = values.ticketId;
      if (values.status !== undefined) patch.status = values.status;

      const { data, error } = await supabase
        .from("crm_sales_meetings")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapMeeting(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-meetings"] });
    },
  });
}

export function useDeleteSalesMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("crm_sales_meetings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-meetings"] });
    },
  });
}
