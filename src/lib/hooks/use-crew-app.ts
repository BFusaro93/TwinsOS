"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { groupVisitsIntoStops, type Stop } from "@/lib/utils/visit-stops";
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
  // crew_hide_pricing decides the SHAPE of the queries below, not just what
  // the page renders — see crewVisitSelect().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("crew_hide_pricing")
    .eq("id", profile.org_id)
    .single();
  return {
    supabase,
    userId: user.id,
    orgId: profile.org_id as string,
    hidePricing: org?.crew_hide_pricing === true,
  };
}

/**
 * Columns the crew tablet reads. Deliberately enumerated rather than `*`.
 *
 * crew_hide_pricing used to be applied only at the last moment, by skipping a
 * <p> in the stop page — every crew device still received the full
 * crm_job_visits row (rate_cents, qty), the full crm_jobs row, and every
 * crm_job_services row with its rate. "Hidden" pricing was one devtools
 * Network tab away, on a shared tablet. Now the rate simply is not requested
 * when the org has hidden it.
 *
 * The visit- and job-level rate_cents are dropped unconditionally: nothing in
 * the crew UI reads them (the stop page reads the *service* rate), so there is
 * no reason to ship them to a field device either way.
 *
 * Enumerating also means a newly added column is not automatically exposed to
 * crew — the right default for this surface. Anything genuinely needed here
 * has to be added on purpose, and mapVisit()/mapJobRow() are the checklist.
 */
function crewVisitSelect(hidePricing: boolean): string {
  const serviceCols = [
    "id", "job_id", "service_id", "service_name", "qty",
    "budgeted_hours", "team_size", "sort_order",
    ...(hidePricing ? [] : ["rate_cents"]),
  ].join(", ");

  // NB: no notes_to_client — crm_jobs has no such column. mapJobRow() reads it
  // and so has always produced null here; under `*` that was invisible, but
  // naming a non-existent column explicitly makes PostgREST 400 the whole
  // request. The visit-level notes_to_client (which does exist) is unaffected.
  const jobCols = [
    "id", "org_id", "client_id", "property_id", "job_type", "status",
    "notes_to_crew", "notes",
    "service_address", "service_city", "service_state", "service_zip",
    "budgeted_hours",
  ].join(", ");

  const visitCols = [
    "id", "org_id", "job_id", "client_id", "job_service_id",
    "storm_event_id", "snow_depth_inches", "temperature", "asset_type",
    "crew_id", "scheduled_date", "start_time", "end_time",
    "status", "sub_status", "completion_notes", "actual_hours", "completed_at",
    "priority", "notes_to_crew", "notes_to_client", "invoice_description",
    "men_count", "job_comments", "assigned_employee_id", "dispatched_at",
    "clocked_in_at", "clocked_out_at", "paused_at", "break_minutes",
    "acknowledged_notes_at", "skip_reason",
    "created_at", "updated_at", "deleted_at",
  ].join(", ");

  return `
    ${visitCols},
    clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
    crm_crews(name),
    crm_jobs(${jobCols}, crm_job_services(${serviceCols}))
  `;
}

function mapJobRow(job: Record<string, unknown>): CRMJob {
  const services = Array.isArray(job.crm_job_services)
    ? (job.crm_job_services as Record<string, unknown>[]).map(s => ({
        id:            s.id as string,
        jobId:         s.job_id as string,
        serviceId:     s.service_id as string | null,
        serviceName:   s.service_name as string,
        qty:           s.qty as number,
        rateCents:     s.rate_cents as number | null,
        budgetedHours: (s.budgeted_hours as number) ?? 0,
        teamSize:      (s.team_size as number) ?? 1,
        sortOrder:     (s.sort_order as number) ?? 0,
      }))
    : [];
  return {
    id:             job.id as string,
    orgId:          job.org_id as string,
    clientId:       job.client_id as string,
    propertyId:     (job.property_id as string) ?? null,
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
    jobComments:          Array.isArray(row.job_comments)
      ? (row.job_comments as CRMJobVisit["jobComments"])
      : typeof row.job_comments === "string" && row.job_comments
        ? [{ id: "crew-note", authorName: "Crew", authorId: "", text: row.job_comments as string, createdAt: (row.updated_at ?? row.created_at) as string }]
        : [],
    assignedEmployeeId:   row.assigned_employee_id as string | null,
    dispatchedAt:         row.dispatched_at as string | null,
    clockedInAt:          row.clocked_in_at as string | null,
    clockedOutAt:         row.clocked_out_at as string | null,
    pausedAt:             row.paused_at as string | null,
    breakMinutes:         (row.break_minutes as number) ?? 0,
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
      const { supabase, userId, hidePricing } = await getAuthContext();

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
        .select(crewVisitSelect(hidePricing))
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

// ── useMyCrewStops ────────────────────────────────────────────────────────────
// Groups today's visits into stops (one per client/day/crew) for the crew
// tablet's list — a pure client-side transform of useMyCrewVisits, sharing
// its cache entry rather than issuing a second fetch.

export function useMyCrewStops(date: string) {
  const query = useMyCrewVisits(date);
  const stops: Stop[] = query.data ? groupVisitsIntoStops(query.data) : [];
  return { ...query, data: stops };
}

// ── useVisitDetail ─────────────────────────────────────────────────────────────

export function useVisitDetail(visitId: string) {
  return useQuery<CRMJobVisit | null>({
    queryKey: ["crew-app-visit", visitId],
    queryFn: async () => {
      const { supabase, hidePricing } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_visits")
        .select(crewVisitSelect(hidePricing))
        .eq("id", visitId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;
      return mapVisit(data as Record<string, unknown>);
    },
  });
}

// ── useStopDetail ──────────────────────────────────────────────────────────────
// Fetches the anchor visit plus every sibling visit sharing its stop (same
// client/day/crew), for the crew tablet's stop page. A dedicated query
// (rather than deriving from the list) so a hard refresh or deep link works
// on a cold cache.

export function useStopDetail(anchorVisitId: string) {
  return useQuery<Stop | null>({
    queryKey: ["crew-app-stop", anchorVisitId],
    queryFn: async () => {
      const { supabase, userId, hidePricing } = await getAuthContext();
      const select = crewVisitSelect(hidePricing);

      // Scope the anchor to the caller's own crew. This used to fetch any
      // visit by id, so a crew account could deep-link
      // /crm/crew/stops/<any visit id> and pull up another crew's stop —
      // client, address, notes and (before the select was narrowed) pricing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: crew } = await (supabase as any)
        .from("crm_crews")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!crew) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: anchorRow, error: anchorErr } = await (supabase as any)
        .from("crm_job_visits")
        .select(select)
        .eq("id", anchorVisitId)
        .eq("crew_id", crew.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (anchorErr) throw anchorErr;
      if (!anchorRow) return null;
      const anchor = mapVisit(anchorRow as Record<string, unknown>);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: siblingRows, error: siblingErr } = await (supabase as any)
        .from("crm_job_visits")
        .select(select)
        .eq("client_id", anchor.clientId)
        .eq("scheduled_date", anchor.scheduledDate)
        .eq("crew_id", crew.id)
        .is("deleted_at", null);
      if (siblingErr) throw siblingErr;

      const crewId = anchor.crewId;
      const siblings = (siblingRows as Record<string, unknown>[])
        .map(mapVisit)
        .filter((v) => (v.crewId ?? null) === (crewId ?? null));

      const stops = groupVisitsIntoStops(siblings.length > 0 ? siblings : [anchor]);
      return stops.find((s) => s.visits.some((v) => v.id === anchorVisitId)) ?? stops[0] ?? null;
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

// ── useCrewMemberTimesForDate ─────────────────────────────────────────────────
// Batched by scheduled_date instead of one useCrewMemberTimes(visitId) call per
// row — the Dispatch Board needs every visible visit's member times at once
// (to detect per-member divergence), and firing N queries for N rows on the
// board would be its own N+1 problem.

export function useCrewMemberTimesForDate(fromDate: string, toDate?: string) {
  return useQuery<CrewMemberTime[]>({
    queryKey: ["crew-member-times", "date", fromDate, toDate ?? fromDate],
    enabled: !!fromDate,
    queryFn: async () => {
      const { supabase } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_crew_member_times")
        .select("*, crm_crew_members(name, role), crm_job_visits!inner(scheduled_date)")
        .order("created_at");
      q = (toDate && toDate !== fromDate)
        ? q.gte("crm_job_visits.scheduled_date", fromDate).lte("crm_job_visits.scheduled_date", toDate)
        : q.eq("crm_job_visits.scheduled_date", fromDate);

      const { data, error } = await q;
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

// ── useCrewMemberTimes ────────────────────────────────────────────────────────

export function useCrewMemberTimes(visitId: string) {
  return useQuery<CrewMemberTime[]>({
    queryKey: ["crew-member-times", visitId],
    enabled: !!visitId,
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
        .select("id, name, role, employee_id")
        .eq("crew_id", crew.id)
        .order("role")
        .order("name");

      return {
        crewId:    crew.id as string,
        crewName:  crew.name as string,
        crewColor: crew.color as string | null,
        myRole:    "crew",
        myName:    crew.name as string,
        members:   (members ?? []) as { id: string; name: string; role: string; employeeId: string | null }[],
      };
    },
  });
}

// ── useCrewDriveToday ─────────────────────────────────────────────────────────
// Day-level drive-time segments for the logged-in crew — yard-to-first-stop,
// between stops, and last-stop-to-yard all land in the same list, since
// crm_crew_drive_segments isn't tied to any one crm_job_visits row.

export interface CrewDriveSegment {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
}

export function useCrewDriveToday(date: string) {
  return useQuery<{ segments: CrewDriveSegment[]; openSegment: CrewDriveSegment | null; totalMinutes: number }>({
    queryKey: ["crew-drive-today", date],
    queryFn: async () => {
      const { supabase, userId } = await getAuthContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: crew } = await (supabase as any)
        .from("crm_crews")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!crew) return { segments: [], openSegment: null, totalMinutes: 0 };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crew_drive_segments")
        .select("id, started_at, ended_at, minutes")
        .eq("crew_id", crew.id)
        .eq("work_date", date)
        .order("started_at", { ascending: true });
      if (error) throw error;

      const segments: CrewDriveSegment[] = (data as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        startedAt: r.started_at as string,
        endedAt: (r.ended_at as string) ?? null,
        minutes: (r.minutes as number) ?? null,
      }));
      const openSegment = segments.find((s) => !s.endedAt) ?? null;
      const totalMinutes = segments.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
      return { segments, openSegment, totalMinutes };
    },
  });
}

// ── mutations ─────────────────────────────────────────────────────────────────

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const localTime = new Date().toTimeString().slice(0, 5);
      const res = await fetch(`/api/crm/crew/visits/${visitId}/clock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localTime }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, visitId) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to clock in — check your connection and try again"),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, notes }: { visitId: string; notes?: string }) => {
      const localTime = new Date().toTimeString().slice(0, 5);
      const res = await fetch(`/api/crm/crew/visits/${visitId}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, localTime }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-app-visit", visitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to clock out — check your connection and try again"),
  });
}

export function useStopClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (anchorVisitId: string) => {
      const localTime = new Date().toTimeString().slice(0, 5);
      const res = await fetch(`/api/crm/crew/stops/${anchorVisitId}/clock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localTime }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, anchorVisitId) => {
      qc.invalidateQueries({ queryKey: ["crew-app-stop", anchorVisitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visit"] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
      // Clock-in auto-closes any open drive segment server-side (see
      // stops/[visitId]/clock-in/route.ts) — refresh so the home screen
      // stops showing "Driving" the moment a job actually starts.
      qc.invalidateQueries({ queryKey: ["crew-drive-today"] });
    },
    onError: () => toast.error("Failed to start job — check your connection and try again"),
  });
}

export function useStartDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crm/crew/drive/start", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-drive-today"] });
    },
    onError: () => toast.error("Failed to start drive time — check your connection and try again"),
  });
}

export function useEndDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crm/crew/drive/end", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-drive-today"] });
    },
    onError: () => toast.error("Failed to end drive time — check your connection and try again"),
  });
}

export function useStopPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (anchorVisitId: string) => {
      const res = await fetch(`/api/crm/crew/stops/${anchorVisitId}/pause`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, anchorVisitId) => {
      qc.invalidateQueries({ queryKey: ["crew-app-stop", anchorVisitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visit"] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to pause — check your connection and try again"),
  });
}

export function useStopResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (anchorVisitId: string) => {
      const res = await fetch(`/api/crm/crew/stops/${anchorVisitId}/resume`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, anchorVisitId) => {
      qc.invalidateQueries({ queryKey: ["crew-app-stop", anchorVisitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visit"] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to resume — check your connection and try again"),
  });
}

export function useStopClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ anchorVisitId, notes }: { anchorVisitId: string; notes?: string }) => {
      const localTime = new Date().toTimeString().slice(0, 5);
      const res = await fetch(`/api/crm/crew/stops/${anchorVisitId}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, localTime }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { anchorVisitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-app-stop", anchorVisitId] });
      qc.invalidateQueries({ queryKey: ["crew-app-visit"] });
      qc.invalidateQueries({ queryKey: ["crew-app-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to stop job — check your connection and try again"),
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
      qc.invalidateQueries({ queryKey: ["crew-app-stop"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to skip service — check your connection and try again"),
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
      qc.invalidateQueries({ queryKey: ["crew-app-stop"] });
    },
    onError: () => toast.error("Failed to acknowledge notes — check your connection and try again"),
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
      qc.invalidateQueries({ queryKey: ["crew-app-stop"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    },
    onError: () => toast.error("Failed to send note — check your connection and try again"),
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
    onError: () => toast.error("Failed to upload photo — check your connection and try again"),
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
    onError: () => toast.error("Failed to save crew member time"),
  });
}

export function useDeleteCrewMemberTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, crewMemberId }: { visitId: string; crewMemberId: string }) => {
      const res = await fetch(`/api/crm/crew/visits/${visitId}/member-times`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crewMemberId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["crew-member-times", visitId] });
    },
    onError: () => toast.error("Failed to remove crew member time"),
  });
}
