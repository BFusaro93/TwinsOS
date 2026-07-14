import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  notes: z.string().optional(),
});

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
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  const notes = parsed.success ? parsed.data.notes : undefined;
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (supabase as any)
    .from("crm_job_visits")
    .select("clocked_in_at")
    .eq("id", visitId)
    .single();

  const clockedInAt = existing.data?.clocked_in_at as string | null;
  let actualHours: number | null = null;
  if (clockedInAt) {
    const diffMs = new Date(now).getTime() - new Date(clockedInAt).getTime();
    actualHours = Math.round((diffMs / 3_600_000) * 100) / 100;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_out_at:   now,
      completed_at:     now,
      status:           "completed",
      actual_hours:     actualHours,
      completion_notes: notes ?? null,
      updated_at:       now,
    })
    .eq("id", visitId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute actual labor cost from crew member times × individual burden rates
  const jobId = data?.job_id as string | undefined;
  if (jobId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: memberTimes } = await (supabase as any)
        .from("crm_crew_member_times")
        .select("crew_member_id, clocked_in_at, clocked_out_at, break_minutes, lunch_minutes")
        .eq("visit_id", visitId)
        .not("clocked_out_at", "is", null);

      let visitLaborCents = 0;
      for (const mt of memberTimes ?? []) {
        const inMs = new Date(mt.clocked_in_at as string).getTime();
        const outMs = new Date(mt.clocked_out_at as string).getTime();
        const deductMins = (Number(mt.break_minutes ?? 0) + Number(mt.lunch_minutes ?? 0));
        const hours = Math.max(0, (outMs - inMs) / 3_600_000 - deductMins / 60);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: member } = await (supabase as any)
          .from("crm_crew_members")
          .select("labor_burden_cents_per_hour")
          .eq("id", mt.crew_member_id)
          .single();
        const burdenRate = Number(member?.labor_burden_cents_per_hour ?? 0);
        visitLaborCents += Math.round(hours * burdenRate);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_job_visits")
        .update({ actual_labor_cost_cents: visitLaborCents })
        .eq("id", visitId);

      // Rollup to job
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: visitTotals } = await (supabase as any)
        .from("crm_job_visits")
        .select("actual_labor_cost_cents")
        .eq("job_id", jobId)
        .is("deleted_at", null);
      const jobLaborCents = (visitTotals ?? []).reduce(
        (sum: number, v: { actual_labor_cost_cents: number }) => sum + (v.actual_labor_cost_cents ?? 0), 0
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_jobs")
        .update({ actual_labor_cost_cents: jobLaborCents })
        .eq("id", jobId);
    } catch {
      // Non-fatal — labor cost rollup failure should not block clock-out response
    }
  }

  return NextResponse.json(data);
}
