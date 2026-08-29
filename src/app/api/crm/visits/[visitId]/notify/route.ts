import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";
import { notifyVisitAssigned, notifyVisitNote } from "@/lib/notifications/visit-notify";

const Body = z.object({ kind: z.enum(["assigned", "note"]) });

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (db as any)
    .from("crm_job_visits")
    .select("id, org_id, crew_id, notes_to_crew, client_id, scheduled_date, start_time")
    .eq("id", visitId)
    .maybeSingle();

  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (visit.org_id !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!visit.crew_id) return NextResponse.json({ ok: true, skipped: "no crew assigned" });

  if (parsed.data.kind === "assigned") {
    await notifyVisitAssigned({
      visitId,
      crewId: visit.crew_id,
      clientId: visit.client_id,
      scheduledDate: visit.scheduled_date,
      startTime: visit.start_time,
    });
  } else {
    if (!visit.notes_to_crew) return NextResponse.json({ ok: true, skipped: "no note set" });
    await notifyVisitNote({
      visitId,
      crewId: visit.crew_id,
      clientId: visit.client_id,
      note: visit.notes_to_crew,
    });
  }

  return NextResponse.json({ ok: true });
}
