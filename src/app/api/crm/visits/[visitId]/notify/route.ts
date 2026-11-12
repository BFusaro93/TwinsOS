import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, effectiveVisitCrewId } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";
import { notifyVisitAssigned, notifyVisitNote } from "@/lib/notifications/visit-notify";
import { rejectWithoutSchedulingPermission } from "@/lib/auth/scheduling-permission";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

const Body = z.object({ kind: z.enum(["assigned", "note"]) });

/** How recent the visit's last write must be for there to be anything to send. */
const RECENT_CHANGE_MS = 5 * 60 * 1000;

/** Short, stable fingerprint of a note for the duplicate-send window. */
function hashNote(note: string): string {
  let h = 0;
  for (let i = 0; i < note.length; i++) h = (Math.imul(31, h) + note.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * POST /api/crm/visits/[visitId]/notify — fire-and-forget push-notification
 * trigger for crew-crew_id assignment / dispatcher-notes changes made via
 * useUpdateVisit() (src/lib/hooks/use-crm-jobs.ts), which writes
 * crm_job_visits directly from the client with its own RLS-scoped Supabase
 * session rather than going through a Route Handler. That direct write is
 * an existing, already-shipped pattern used across DispatchBoard.tsx,
 * SnowDispatchBoard.tsx, and JobDetail.tsx — reworking all of those call
 * sites to route through a server endpoint just for this feature was judged
 * too large/risky a change, so instead useUpdateVisit's mutationFn fires a
 * best-effort call to this endpoint (mirroring the exact same pattern
 * already used for email notifications — see fetch("/api/notifications/
 * email", ...) in src/lib/hooks/use-approval-requests.ts) right after its
 * own client-side write succeeds.
 *
 * This route does NOT trust the client for who/what to notify — it
 * re-reads the visit's current crew_id/notes_to_crew from the DB (via the
 * service-role client) and only uses those values, so a caller can at most
 * ask "check now" for a visit, never spoof a notification's recipient or
 * content. Requires the caller's session to belong to the same org as the
 * visit, same guard as /api/notifications/email.
 */
export async function POST(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Only someone who can change the schedule sends crew pushes — a crew login
  // or a view-only seat could otherwise ping crews' phones at will.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role === "crew") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const denied = await rejectWithoutSchedulingPermission(supabase);
  if (denied) return denied;
  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  // Per-user ceiling: a normal day of dispatching stays far below it.
  if (!(await checkAuthRateLimit(`visit-notify:user:${user.id}`, 120, 60))) {
    return NextResponse.json({ error: "Too many notifications — try again in a minute" }, { status: 429 });
  }

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (db as any)
    .from("crm_job_visits")
    .select("id, org_id, crew_id, crew_unassigned, notes_to_crew, client_id, scheduled_date, start_time, updated_at, crm_jobs(crew_id)")
    .eq("id", visitId)
    .maybeSingle();

  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (visit.org_id !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // The EFFECTIVE crew (visit.crew_id, else the job's): most visits inherit their
  // crew from the job, so the raw visit.crew_id made "Note from Dispatch" and
  // "assigned" pushes silently skip for the common case.
  const crewId = effectiveVisitCrewId(visit);
  if (!crewId) return NextResponse.json({ ok: true, skipped: "no crew assigned" });

  // Nothing changed: the caller fires this right after its own write, so a
  // visit untouched for the last few minutes has no new crew or note to tell
  // anyone about — re-posting it must not re-send the same push.
  const updatedAt = visit.updated_at ? new Date(visit.updated_at as string).getTime() : 0;
  if (!updatedAt || Date.now() - updatedAt > RECENT_CHANGE_MS) {
    return NextResponse.json({ ok: true, skipped: "nothing changed" });
  }
  // The same push (same visit, crew and note) goes out at most once per window.
  const content = parsed.data.kind === "assigned" ? crewId : `${crewId}:${hashNote(String(visit.notes_to_crew ?? ""))}`;
  if (!(await checkAuthRateLimit(`visit-notify:${visitId}:${parsed.data.kind}:${content}`, 1, 600))) {
    return NextResponse.json({ ok: true, skipped: "already sent" });
  }

  if (parsed.data.kind === "assigned") {
    await notifyVisitAssigned({
      visitId,
      crewId,
      clientId: visit.client_id,
      scheduledDate: visit.scheduled_date,
      startTime: visit.start_time,
    });
  } else {
    if (!visit.notes_to_crew) return NextResponse.json({ ok: true, skipped: "no note set" });
    await notifyVisitNote({
      visitId,
      crewId,
      clientId: visit.client_id,
      note: visit.notes_to_crew,
    });
  }

  return NextResponse.json({ ok: true });
}
