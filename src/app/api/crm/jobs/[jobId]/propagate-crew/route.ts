import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
  const body = await request.json() as { crewId: string | null; fromDate: string };
  const { crewId, fromDate } = body;

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
