import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({ note: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const body = await request.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Fetch current visit to get job_id, client_id, and the existing comments
  // array — this must be appended to, not overwritten, or it clobbers any
  // comments the office already added from the dispatch board.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, client_id, org_id, job_comments")
    .eq("id", visitId)
    .single();

  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });

  const now = new Date().toISOString();
  const existingComments = Array.isArray(visit.job_comments)
    ? visit.job_comments
    : typeof visit.job_comments === "string" && visit.job_comments
      ? [{ id: "crew-note", authorName: "Crew", authorId: "", text: visit.job_comments, createdAt: now }]
      : [];
  const newComments = [
    ...existingComments,
    { id: crypto.randomUUID(), authorName: "Crew", authorId: user.id, text: parsed.data.note, createdAt: now },
  ];

  // Append to job_comments on the visit (dispatchers see this on the board)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedVisit, error: updateError } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      job_comments: newComments,
      updated_at:   now,
    })
    .eq("id", visitId)
    .select("job_comments")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Also write to client_activity for the unified timeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_activity")
    .insert({
      org_id:        visit.org_id,
      client_id:     visit.client_id,
      activity_type: "crew_note",
      description:   parsed.data.note,
      reference_id:  visitId,
      created_by:    user.id,
      created_at:    now,
    });

  return NextResponse.json(updatedVisit);
}
