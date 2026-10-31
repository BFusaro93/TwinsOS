import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkPackageMinDaysViolation } from "@/lib/package-visit-recalc";
import { VISIT_STATUS_VALUES, reopenOneTimeJobsForVisits } from "@/lib/visits/reopen-job";
import { formatMonthDay } from "@/lib/utils";
import { loadServiceChemicalsForVisit } from "@/lib/chemical-preload";
import { notifyVisitAssigned } from "@/lib/notifications/visit-notify";
import {
  INVOICED_VISIT_LOCKED_CODE,
  INVOICED_VISIT_LOCKED_MESSAGE,
  findInvoicedLockedVisits,
  overrideInvoicedVisit,
} from "@/lib/visits/invoiced-guard";

const BulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  updates: z.object({
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(VISIT_STATUS_VALUES).optional(),
    crew_id: z.string().uuid().nullable().optional(),
    /** Per-visit "no crew" override (wins over the job's crew). Cleared by an explicit crew_id. */
    crew_unassigned: z.boolean().optional(),
    priority: z.number().int().optional(),
    skip_reason: z.string().max(500).nullable().optional(),
  }),
  /** Admin-only: also move / reopen completed visits that are already invoiced. */
  override_invoiced: z.boolean().optional(),
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

  const { updates, override_invoiced: overrideInvoiced } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];

  // A dispatch-board drag can reschedule a package-sequenced visit closer to
  // its predecessor's actual completion than that service's min_days allows —
  // the completion-time recalc (recalcNextPackageVisitDate) only pushes dates
  // OUT on completion, it never guards a manual reschedule. Check every
  // affected visit before writing; this is a data-integrity floor, not an
  // advisory warning, so any violation blocks the whole batch.
  // Chunked: up to 500 ids in one `.in()` overflow the request URL (a select-all
  // on a busy day failed the whole action).
  type BeforeRow = {
    id: string; client_id: string; job_id: string; scheduled_date: string; status: string;
    crew_id: string | null; start_time: string | null;
    clocked_in_at: string | null; clocked_out_at: string | null;
  };
  const before: BeforeRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: beforeRows } = await (supabase as any)
      .from("crm_job_visits")
      .select("id, client_id, job_id, scheduled_date, status, crew_id, start_time, clocked_in_at, clocked_out_at")
      .in("id", ids.slice(i, i + 100));
    before.push(...((beforeRows ?? []) as BeforeRow[]));
  }

  // crm_crews has no org-scoped FK to crm_job_visits, so a crew id from another
  // org would write through RLS (which only checks the visit's own org_id) and
  // leak this org's schedule to that crew. Resolve it through the caller's
  // RLS-scoped client — a foreign id comes back empty.
  if (updates.crew_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crewRow } = await (supabase as any)
      .from("crm_crews").select("id").eq("id", updates.crew_id).is("deleted_at", null).maybeSingle();
    if (!crewRow) return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }

  // A visit the crew is working right now (clocked in, not out) can't be moved to
  // another day: the crew app only carries over clocked-in visits scheduled
  // BEFORE today, so a stop moved to tomorrow vanishes from the crew's list
  // mid-stop, they can't clock out, and the hours are filed under the wrong day.
  if (updates.scheduled_date) {
    const running = before.filter(
      (r) => r.clocked_in_at && !r.clocked_out_at && r.scheduled_date !== updates.scheduled_date
    );
    if (running.length > 0) {
      return NextResponse.json({
        error: running.length === 1
          ? "This visit is in progress (the crew has clocked in), so it can't be moved to another day. Have the crew clock out first."
          : `${running.length} of the selected visits are in progress (the crew has clocked in), so they can't be moved to another day. Have the crews clock out first.`,
      }, { status: 409 });
    }
  }

  // Same for a crew change: ownership checks key off the visit's crew, so re-crewing a
  // stop mid-clock locks the working crew out of clock-out, pause and skip.
  if (updates.crew_id !== undefined || updates.crew_unassigned) {
    const running = before.filter(
      (r) => r.clocked_in_at && !r.clocked_out_at && (updates.crew_unassigned || r.crew_id !== updates.crew_id)
    );
    if (running.length > 0) {
      return NextResponse.json({
        error: running.length === 1
          ? "This visit is in progress (the crew has clocked in), so its crew can't be changed. Have the crew clock out first."
          : `${running.length} of the selected visits are in progress (the crew has clocked in), so their crew can't be changed. Have the crews clock out first.`,
      }, { status: 409 });
    }
  }

  // Completed + invoiced visits are locked against moves and status changes
  // (DB trigger trg_crm_job_visits_guard_invoiced is the floor). Block the
  // whole batch with a clear message unless an admin explicitly overrides.
  const change = { status: updates.status, scheduled_date: updates.scheduled_date };
  const locked = await findInvoicedLockedVisits(supabase, before, change);
  if (locked.size > 0) {
    if (!overrideInvoiced) {
      return NextResponse.json({
        error: locked.size === 1
          ? INVOICED_VISIT_LOCKED_MESSAGE
          : `${locked.size} of the selected visits are completed and already invoiced — void or edit their invoices first, or ask an admin to override.`,
        code: INVOICED_VISIT_LOCKED_CODE,
        lockedIds: [...locked],
      }, { status: 409 });
    }
  }

  if (updates.scheduled_date) {
    for (const row of before) {
      if (row.scheduled_date === updates.scheduled_date) continue;
      const violation = await checkPackageMinDaysViolation(supabase, row.id, updates.scheduled_date);
      if (violation) {
        return NextResponse.json({ error: violation }, { status: 409 });
      }
    }
  }

  // Admin override: apply the status/date change to each locked visit via the
  // override RPC first; the plain update below then sees no change for them.
  for (const id of locked) {
    const res = await overrideInvoicedVisit(supabase, id, change);
    if (res.error) return NextResponse.json({ error: res.error }, { status: res.forbidden ? 403 : 500 });
  }

  const patch = {
    ...updates,
    // An explicit crew and "unassigned" are mutually exclusive.
    ...(updates.crew_id ? { crew_unassigned: false } : {}),
    ...(updates.crew_unassigned ? { crew_id: null } : {}),
    updated_at: new Date().toISOString(),
  };
  let error: { message: string; hint?: string } | null = null;
  for (let i = 0; i < ids.length && !error; i += 100) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any).from("crm_job_visits").update(patch).in("id", ids.slice(i, i + 100));
    error = res.error;
  }

  if (error) {
    const isLocked = (error as { hint?: string }).hint === INVOICED_VISIT_LOCKED_CODE;
    return NextResponse.json(
      { error: error.message, ...(isLocked ? { code: INVOICED_VISIT_LOCKED_CODE } : {}) },
      { status: isLocked ? 409 : 500 }
    );
  }

  await reopenOneTimeJobsForVisits(supabase, before, updates.status);

  // Dispatching from the board's bulk Change Status: the single-visit paths stamp
  // dispatched_at (what the "visit dispatched" Zapier trigger keys on) and
  // pre-load the service's chemicals onto the crew's Chemical Mix card; the bulk
  // path did neither, so those visits looked undispatched to both.
  if (updates.status === "dispatched") {
    const newlyDispatched = before.filter((r) => r.status !== "dispatched").map((r) => r.id);
    if (newlyDispatched.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_job_visits")
        .update({ dispatched_at: new Date().toISOString() })
        .in("id", newlyDispatched);
      for (const id of newlyDispatched) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await loadServiceChemicalsForVisit(supabase as any, id).catch(() => 0);
      }
    }
  }

  // Re-assigning a batch of visits to a crew: the single-visit path pushes "New
  // Job Assigned" to that crew's phones (useUpdateVisit -> /notify) but the bulk
  // path never did, so a dispatcher moving a sick crew's day over to another
  // crew left that crew with no notice. Capped so a select-all doesn't turn
  // into hundreds of pushes in one request.
  if (updates.crew_id) {
    const crewId = updates.crew_id;
    const changed = before.filter((r) => r.crew_id !== crewId && r.status !== "completed").slice(0, 40);
    await Promise.allSettled(
      changed.map((r) =>
        notifyVisitAssigned({
          visitId: r.id,
          crewId,
          clientId: r.client_id,
          scheduledDate: updates.scheduled_date ?? r.scheduled_date,
          startTime: r.start_time,
        })
      )
    );
  }

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
    if ((updates.status === "skipped" || updates.status === "cancelled") && row.status !== updates.status) {
      const reason = updates.skip_reason?.trim();
      const subject = `Visit ${updates.status} ${formatMonthDay(updates.scheduled_date ?? row.scheduled_date)}`;
      rows.push({ ...base, subject: reason ? `${subject}: ${reason}` : subject });
    }
    return rows;
  });
  if (activity.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert(activity);
  }

  return NextResponse.json({ updated: ids.length });
}
