import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { notifyVisitAssigned, notifyVisitNote } from "@/lib/notifications/visit-notify";
import { checkPackageMinDaysViolation } from "@/lib/package-visit-recalc";
import { formatMonthDay } from "@/lib/utils";

const PatchSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional(),
  crew_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().optional(),
  notes_to_crew: z.string().nullable().optional(),
  invoice_description: z.string().nullable().optional(),
  /** Why a visit was skipped/cancelled (dispatch board reason prompt). */
  skip_reason: z.string().max(500).nullable().optional(),
});

export async function PATCH(
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // A direct edit can reschedule a package-sequenced visit closer to its
  // predecessor's actual completion than that service's min_days allows —
  // the completion-time recalc (recalcNextPackageVisitDate) only pushes dates
  // OUT on completion, it never guards a manual edit. This is a
  // data-integrity floor, not an advisory warning, so a violation blocks the
  // write outright.
  // Snapshot before the write so the activity rows below can say what
  // changed (old date → new date, scheduled → dispatched).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (supabase as any)
    .from("crm_job_visits")
    .select("client_id, job_id, scheduled_date, status")
    .eq("id", visitId)
    .maybeSingle();
  const prev = before as { client_id: string; job_id: string; scheduled_date: string; status: string } | null;

  if (parsed.data.scheduled_date && parsed.data.scheduled_date !== prev?.scheduled_date) {
    const violation = await checkPackageMinDaysViolation(supabase, visitId, parsed.data.scheduled_date);
    if (violation) {
      return NextResponse.json({ error: violation }, { status: 409 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", visitId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lightweight client-timeline rows (no notifications) for a reschedule
  // and for the transition into "dispatched" — the dispatch board's bulk
  // Change Status / Move actions land here. Best-effort.
  if (prev) {
    const rows: { subject: string }[] = [];
    if (parsed.data.scheduled_date && parsed.data.scheduled_date !== prev.scheduled_date) {
      rows.push({ subject: `Visit moved ${formatMonthDay(prev.scheduled_date)} → ${formatMonthDay(parsed.data.scheduled_date)}` });
    }
    if (parsed.data.status === "dispatched" && prev.status !== "dispatched") {
      rows.push({ subject: `Visit dispatched ${formatMonthDay(parsed.data.scheduled_date ?? prev.scheduled_date)}` });
    }
    // Skipped / cancelled (dispatch board bulk "Change Status") — same wording
    // the single-visit mutations write: "Visit skipped 9/9 — Weather".
    if ((parsed.data.status === "skipped" || parsed.data.status === "cancelled") && prev.status !== parsed.data.status) {
      const reason = parsed.data.skip_reason?.trim();
      const base = `Visit ${parsed.data.status} ${formatMonthDay(parsed.data.scheduled_date ?? prev.scheduled_date)}`;
      rows.push({ subject: reason ? `${base} — ${reason}` : base });
    }
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert(
        rows.map((r) => ({ ...r, client_id: prev.client_id, activity_type: "job", ref_id: prev.job_id, ref_table: "crm_jobs", created_by: user.id }))
      );
    }
  }

  // Push notifications — best-effort, never block the response on these.
  // Only fire when the patch actually touched the relevant field (not just
  // whenever crew_id/notes_to_crew happen to be non-null on the row).
  //
  // crm_crews has no org-scoped FK to crm_job_visits, so a caller could pass
  // a crew_id belonging to a different org and the update above would still
  // succeed (RLS on crm_job_visits only checks this visit's own org_id) —
  // that would leak this org's client name/schedule to another org's crew
  // member. Re-check the crew via the RLS-scoped `supabase` client (not the
  // admin client) so a cross-org id resolves to nothing before notifying.
  if (parsed.data.crew_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crew } = await (supabase as any)
      .from("crm_crews")
      .select("id")
      .eq("id", parsed.data.crew_id)
      .maybeSingle();
    if (crew) {
      void notifyVisitAssigned({
        visitId,
        crewId: parsed.data.crew_id,
        clientId: data?.client_id as string | undefined,
        scheduledDate: (data?.scheduled_date as string | undefined) ?? null,
        startTime: (data?.start_time as string | undefined) ?? null,
      });
    }
  }
  if (parsed.data.notes_to_crew && data?.crew_id) {
    void notifyVisitNote({
      visitId,
      crewId: data.crew_id as string,
      clientId: data?.client_id as string | undefined,
      note: parsed.data.notes_to_crew,
    });
  }

  return NextResponse.json(data);
}
