import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const BodySchema = z.object({
  crewId: z.string().uuid().nullable(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fromDate must be YYYY-MM-DD"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { crewId, fromDate } = parsed.data;

  // Org always comes from the session, never the body.
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job } = await (supabase as any)
    .from("crm_jobs").select("id").eq("id", jobId).eq("org_id", profile.org_id).is("deleted_at", null).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // A crew id from another org (or a deleted crew) must never be stamped on
  // this org's visits. null = clear the crew, which needs no lookup.
  if (crewId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crew } = await (supabase as any)
      .from("crm_crews").select("id").eq("id", crewId).eq("org_id", profile.org_id).is("deleted_at", null).maybeSingle();
    if (!crew) return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from("crm_job_visits")
    .update({ crew_id: crewId }, { count: "exact" })
    .eq("job_id", jobId)
    // Visits individually pinned to "no crew" stay unassigned — the job's
    // crew change must not reach them.
    .eq("crew_unassigned", false)
    // Never reassign a stop that is mid-clock — it would split the stop.
    .neq("status", "in_progress")
    .is("clocked_in_at", null)
    .neq("status", "completed")
    .neq("status", "cancelled")
    .neq("status", "skipped")
    .gte("scheduled_date", fromDate)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: count ?? 0 });
}
