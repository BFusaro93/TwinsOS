"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMJob, CRMJobVisit, VisitPhoto, CrewMemberTime } from "@/types/crm-jobs";

// ── helpers ───────────────────────────────────────────────────────────────────

async function getAuthContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  return { supabase, userId: user.id, orgId: profile.org_id as string };
}

function mapJobRow(job: Record<string, unknown>): CRMJob {
  const services = Array.isArray(job.crm_job_services)
    ? (job.crm_job_services as Record<string, unknown>[]).map(s => ({
        id:          s.id as string,
        jobId:       s.job_id as string,
        serviceId:   s.service_id as string | null,
        serviceName: s.service_name as string,
        qty:         s.qty as number,
        rateCents:   s.rate_cents as number | null,
      }))
    : [];
  return {
    id:             job.id as string,
    orgId:          job.org_id as string,
    clientId:       job.client_id as string,
    jobType:        job.job_type as CRMJob["jobType"],
    status:         job.status as string,
    notesToCrew:    (job.notes_to_crew as string) ?? null,
    notesToClient:  (job.notes_to_client as string) ?? null,
    notes:          (job.notes as string) ?? null,
    serviceAddress: (job.service_address as string) ?? null,
    serviceCity:    (job.service_city as string) ?? null,
    serviceState:   (job.service_state as string) ?? null,
    serviceZip:     (job.service_zip as string) ?? null,
    budgetedHours:  (job.budgeted_hours as number) ?? null,
    services,
  } as unknown as CRMJob;
}

function mapVisit(row: Record<string, unknown>): CRMJobVisit {
  const client = row.clients as Record<string, unknown> | null;
  const crew   = row.crm_crews as Record<string, unknown> | null;
  const job    = row.crm_jobs as Record<string, unknown> | null;
  return {
    id:                   row.id as string,
    orgId:                row.org_id as string,
    jobId:                row.job_id as string,
    clientId:             row.client_id as string,
    jobServiceId:         (row.job_service_id as string) ?? null,
    stormEventId:         (row.storm_event_id as string) ?? null,
    snowDepthInches:      (row.snow_depth_inches as number) ?? null,
    temperature:          (row.temperature as number) ?? null,
    assetType:            (row.asset_type as string) ?? null,
    materialsUsed:        [],
    clientName:           (client?.display_name as string) ?? null,
    clientPhone:          (client?.primary_phone as string) ?? null,
    crewId:               row.crew_id as string | null,
    crewName:             (crew?.name as string) ?? null,
    scheduledDate:        row.scheduled_date as string,
    startTime:            row.start_time as string | null,
    endTime:              row.end_time as string | null,
    status:               row.status as CRMJobVisit["status"],
    subStatus:            row.sub_status as string | null,
    orderNum:             null,
    completionNotes:      row.completion_notes as string | null,
    actualHours:          row.actual_hours as number | null,
    budgetedHours:        (job?.budgeted_hours as number) ?? null,
    completedAt:          row.completed_at as string | null,
    priority:             (row.priority as number) ?? 1,
    notesToCrew:          row.notes_to_crew as string | null,
    notesToClient:        row.notes_to_client as string | null,
    invoiceDescription:   row.invoice_description as string | null,
    menCount:             (row.men_count as number) ?? 1,
    qty:                  row.qty as number | null,
    rateCents:            row.rate_cents as number | null,
    jobComments:          [],
    assignedEmployeeId:   row.assigned_employee_id as string | null,
    dispatchedAt:         row.dispatched_at as string | null,
    clockedInAt:          row.clocked_in_at as string | null,
    clockedOutAt:         row.clocked_out_at as string | null,
    acknowledgedNotesAt:  row.acknowledged_notes_at as string | null,
    skipReason:           row.skip_reason as string | null,
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
    deletedAt:            row.deleted_at as string | null,
    job: job ? mapJobRow(job) : undefined,
  };
}

// ── useMyCrewVisits ───────────────────────────────────────────────────────────
// Returns today's visits for the crew the logged-in user belongs to.

export function useMyCrewVisits(date: string) {
  return useQuery<CRMJobVisit[]>({
    queryKey: ["crew-app-visits", date],
    queryFn: async () => {
      const { supabase, userId } = await getAuthContext();

      // Crew accounts log in as the crew itself — find the crew by user_id on crm_crews
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: crew } = await (supabase as any)
        .from("crm_crews")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!crew) return [];
      const membership = { crew_id: crew.id as string };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_visits")
        .select(`
          *,
          clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
          crm_crews(name),
          crm_jobs(*, crm_job_services(*))
        `)
        .eq("scheduled_date", date)
        .eq("crew_id", membership.crew_id)
        .is("deleted_at", null)
        .order("priority", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data as Record<string, unknown>[]).map(mapVisit);
    },
  });
}

// ── useVisitDetail ─────────────────────────────────────────────────────────────

export function useVisitDetail(visitId: string) {
  return useQuery<CRMJobVisit | null>({
    queryKey: ["crew-app-visit", visitId],
    queryFn: async () => {
      const { supabase } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_visits")
        .select(`
          *,
          clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
          crm_crews(name),
          crm_jobs(*, crm_job_services(*))
        `)
        .eq("id", visitId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;
      return mapVisit(data as Record<string, unknown>);
    },
  });
}

// ── useVisitPhotos ─────────────────────────────────────────────────────────────

export function useVisitPhotos(visitId: string) {
  return useQuery<VisitPhoto[]>({
    queryKey: ["crew-app-photos", visitId],
    queryFn: async () => {
      const { supabase } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_visit_photos")
        .select("*")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as Record<string, unknown>[]).map(r => ({
        id:          r.id as string,
        visitId:     r.visit_id as string,
        jobId:       r.job_id as string,
        storagePath: r.storage_path as string,
        caption:     r.caption as string | null,
        uploadedBy:  r.uploaded_by as string | null,
        createdAt:   r.created_at as string,
      }));
    },
  });
}

// ── useCrewMemberTimes ────────────────────────────────────────────────────────

export function useCrewMemberTimes(visitId: string) {
  return useQuery<CrewMemberTime[]>({
    queryKey: ["crew-member-times", visitId],
    queryFn: async () => {
      const { supabase } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crew_member_times")
        .select("*, crm_crew_members(name, role)")
        .eq("visit_id", visitId)
        .order("created_at");

      if (error) throw error;
      return (data as Record<string, unknown>[]).map(r => {
        const member = r.crm_crew_members as Record<string, unknown> | null;
        return {
          id:            r.id as string,
          visitId:       r.visit_id as string,
          crewMemberId:  r.crew_member_id as string,
          memberName:    (member?.name as string) ?? null,
          memberRole:    (member?.role as string) ?? null,
          clockedInAt:   r.clocked_in_at as string | null,
          clockedOutAt:  r.clocked_out_at as string | null,
          breakMinutes:  (r.break_minutes as number) ?? 0,
          lunchMinutes:  (r.lunch_minutes as number) ?? 0,
        };
      });
    },
  });
}

// ── useMyCrewInfo ─────────────────────────────────────────────────────────────
// Returns the crew and member info for the logged-in user.

export function useMyCrewInfo() {
  return useQuery({
    queryKey: ["my-crew-info"],
    queryFn: async () => {
      const { supabase, userId } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: crew } = await (supabase as any)
        .from("crm_crews")
        .select("id, name, color")
        .eq("user_id", userId)
        .maybeSingle();

      if (!crew) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: members } = await (supabase as any)
        .from("crm_crew_members")
        .select("id, name, role, user_id")
        .eq("crew_id", crew.id)
        .order("role")
        .order("name");

      return {
        crewId:    crew.id as string,
        crewName:  crew.name as string,
        crewColor: crew.color as string | null,
        myRole:    "crew",
        myName:    crew.name as string,
        members:   (members ?? []) as { id: string; name: string; role: string; userId: string | null }[],
      };
    },
  });
}

// ── mutations ─────────────────────────────────────────────────────────────────

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/clock-in`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, visitId) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, notes }: { visitId: string; notes?: string }) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
  });
}

export function useSkipVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, reason }: { visitId: string; reason: string }) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
  });
}

export function useAcknowledgeNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/acknowledge`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, visitId) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
    },
  });
}

export function useAddCrewNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, note }: { visitId: string; note: string }) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
  });
}

export function useUploadVisitPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, file, caption }: { visitId: string; file: File; caption?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (caption) form.append("caption", caption);
      const res = await fetch(`/api/crm/crew/visits/${visitId}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-app-photos", visitId] });
    },
  });
}

export function useUpsertCrewMemberTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      visitId,
      crewMemberId,
      clockedInAt,
      clockedOutAt,
    }: {
      visitId: string;
      crewMemberId: string;
      clockedInAt?: string | null;
      clockedOutAt?: string | null;
    }) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/member-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crewMemberId, clockedInAt, clockedOutAt }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-member-times", visitId] });
    },
  });
}
