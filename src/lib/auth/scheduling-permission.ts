import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";

/**
 * Keys that let a user change the schedule: the dispatch board (and Crew Board /
 * calendar), the waiting list, snow dispatch, and Add Job (a job's own Visits
 * tab — creating, moving, re-crewing, completing and deleting its visits).
 * "View Jobs" (job_view) is view-only and deliberately NOT here. Admins pass
 * inside has_settings_permission. The database enforces the same keys on
 * crm_job_visits writes from an end-user session
 * (enforce_crm_job_visit_schedule_write); crew logins are exempt there and use
 * the crew app's own routes.
 */
export const SCHEDULING_KEYS = [
  "sched_dispatch_board",
  "sched_waiting_list",
  "snow_dispatch_manage",
  "job_add",
];

/** Returns a 403 response when the caller holds none of the scheduling keys, else null. */
export async function rejectWithoutSchedulingPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  extraKeys: string[] = []
): Promise<NextResponse | null> {
  if (await hasAnySettingsPermission(supabase, [...SCHEDULING_KEYS, ...extraKeys])) return null;
  return NextResponse.json({ error: "You do not have permission to change the schedule" }, { status: 403 });
}
