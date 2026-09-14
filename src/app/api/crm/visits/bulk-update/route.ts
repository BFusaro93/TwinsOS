import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkPackageMinDaysViolation } from "@/lib/package-visit-recalc";
import { formatMonthDay } from "@/lib/utils";

const BulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  updates: z.object({
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.string().optional(),
    crew_id: z.string().uuid().nullable().optional(),
    priority: z.number().int().optional(),
  }),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = BulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ids, updates } = parsed.data;

  // A dispatch-board drag can reschedule a package-sequenced visit closer to
  // its predecessor's actual completion than that service's min_days allows —
  // the completion-time recalc (recalcNextPackageVisitDate) only pushes dates
  // OUT on completion, it never guards a manual reschedule. Check every
  // affected visit before writing; this is a data-integrity floor, not an
  // advisory warning, so any violation blocks the whole batch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: beforeRows } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, client_id, job_id, scheduled_date, status")
    .in("id", ids);
  const before = (beforeRows ?? []) as { id: string; client_id: string; job_id: string; scheduled_date: string; status: string }[];

  if (updates.scheduled_date) {
    for (const row of before) {
      if (row.scheduled_date === updates.scheduled_date) continue;
      const violation = await checkPackageMinDaysViolation(supabase, row.id, updates.scheduled_date);
      if (violation) {
        return NextResponse.json({ error: violation }, { status: 409 });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("crm_job_visits")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One lightweight client-timeline row per moved / newly-dispatched visit
  // ("Visit moved 9/7 → 9/8"). No notifications; best-effort.
  const activity = before.flatMap((row) => {
    const rows: Record<string, unknown>[] = [];
    const base = { client_id: row.client_id, activity_type: "job", ref_id: row.job_id, ref_table: "crm_jobs", created_by: user.id };
    if (updates.scheduled_date && updates.scheduled_date !== row.scheduled_date) {
      rows.push({ ...base, subject: `Visit moved ${formatMonthDay(row.scheduled_date)} → ${formatMonthDay(updates.scheduled_date)}` });
    }
    if (updates.status === "dispatched" && row.status !== "dispatched") {
      rows.push({ ...base, subject: `Visit dispatched ${formatMonthDay(updates.scheduled_date ?? row.scheduled_date)}` });
    }
    return rows;
  });
  if (activity.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert(activity);
  }

  return NextResponse.json({ updated: ids.length });
}
