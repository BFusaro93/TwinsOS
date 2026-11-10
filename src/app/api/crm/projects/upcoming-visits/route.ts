import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { selectAllRows } from "@/lib/visits/generate";
import { findJobVisitsToRemove, removeJobVisits } from "@/lib/visits/job-status-visits";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

const Body = z.object({
  projectId: z.string().uuid(),
  /** preview — count what cancelling the project affects; cancel — cancel / prune its visits. */
  action: z.enum(["preview", "cancel"]),
});

/**
 * POST /api/crm/projects/upcoming-visits — backs the "Cancel its N upcoming
 * visits?" question asked when a project is cancelled (same pattern and rules
 * as /api/crm/clients/upcoming-visits): per job linked to the project, the
 * rule a cancelled job follows (findJobVisitsToRemove / removeJobVisits) —
 * untouched one-time/project visits are marked cancelled, generated recurring
 * ones pruned. Completed, in-progress and invoiced visits are left alone.
 *
 * Preview also reports how many PENDING billing milestones the project has —
 * cancelling removes those (trg_projects_cancel_pending_milestones).
 *
 * Auth: org from the session; the caller needs the projects key. The project is
 * re-read under the session org, and every write goes through the caller's RLS
 * client.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!profile?.org_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = profile.org_id as string;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "projectId and action are required" }, { status: 400 });
  const { projectId, action } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", { p_key: "sched_add_modify_projects" });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: project, error: projErr } = await db
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (projErr) return NextResponse.json({ error: "Failed to check the project" }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const today = todayInZone(await getOrgTimeZone(supabase, orgId));
    const { rows: jobs, error } = await selectAllRows<{ id: string; job_type: string | null }>(() =>
      db.from("crm_jobs").select("id, job_type").eq("project_id", projectId).eq("org_id", orgId).is("deleted_at", null)
    );
    if (error) throw new Error(error);
    let count = 0;
    let jobCount = 0;
    for (const job of jobs) {
      const target = await findJobVisitsToRemove(db, { jobId: job.id, jobType: job.job_type, today });
      if (target.ids.length === 0) continue;
      jobCount++;
      count += action === "cancel" ? await removeJobVisits(db, target) : target.ids.length;
    }

    let pendingMilestones = 0;
    if (action === "preview") {
      const { count: msCount, error: msErr } = await db
        .from("estimate_milestones")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "pending")
        .is("deleted_at", null);
      if (msErr) throw new Error(msErr.message);
      pendingMilestones = msCount ?? 0;
    }
    return NextResponse.json({ count, jobs: jobCount, pendingMilestones });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
