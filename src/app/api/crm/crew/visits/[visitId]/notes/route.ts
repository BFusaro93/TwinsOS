import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { logger } from "@/lib/logger";

const log = logger.child("crew/notes");

const Body = z.object({ note: z.string().min(1) });

// Accepts either the web app's cookie session or crew-app's bearer token —
// see getRouteAuth().
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // .maybeSingle(), not .single(): a deleted/unknown visit made .single()
  // populate `error` instead of returning a null row, so this returned a 500
  // the offline sync engine read as transient and retried five times, and
  // the 404 below was unreachable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, client_id, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();

  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const now = new Date().toISOString();
  // The offline queue item's id, when crew-app sent one. Using it as the
  // comment's own id makes this route idempotent: the RPC below skips the
  // append when a comment with that id is already in the array, so a retry
  // after a flaky partial success can't double-post the same note.
  const commentId = request.headers.get("idempotency-key") || crypto.randomUUID();

  // Appended server-side, inside the row lock, rather than read-modify-write
  // from here. The old version SELECTed job_comments, pushed onto the array
  // in JS and UPDATEd the whole column back — so a dispatcher comment landing
  // between the read and the write was silently overwritten, which is exactly
  // what this route's own "must be appended to, not overwritten" comment was
  // trying to prevent. See the crm_append_visit_job_comment migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobComments, error: appendError } = await (supabase as any).rpc(
    "crm_append_visit_job_comment",
    {
      p_visit_id:    visitId,
      p_comment_id:  commentId,
      p_author_name: "Crew",
      p_author_id:   user.id,
      p_text:        parsed.data.note,
      p_created_at:  now,
    }
  );

  if (appendError) {
    log.error("job_comments append failed", { visitId, error: appendError.message });
    return NextResponse.json({ error: "Couldn't save this note. Try again." }, { status: 500 });
  }

  // Also write to client_activity for the unified timeline. These were the
  // wrong column names (`description`/`reference_id` — client_activity has
  // `subject`/`body`/`ref_id`/`ref_table`) and the result wasn't destructured,
  // so every crew note silently failed its PGRST204 and never reached the
  // client timeline. Written with the caller's own session: the INSERT policy
  // is org_id + has_crm_access(), and has_crm_access() is true for role
  // 'crew'. Best-effort — the note is already on the visit either way.
  if (visit.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: activityError } = await (supabase as any)
      .from("client_activity")
      .insert({
        org_id:        visit.org_id,
        client_id:     visit.client_id,
        activity_type: "crew_note",
        subject:       "Note from the crew",
        body:          parsed.data.note,
        ref_id:        visitId,
        ref_table:     "crm_job_visits",
        created_by:    user.id,
        occurred_at:   now,
      });
    if (activityError) log.error("activity insert failed", { visitId, error: activityError.message });
  }

  return NextResponse.json({ job_comments: jobComments ?? [] });
}
