import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";

/**
 * Keys that put scheduling controls in front of a user: the dispatch board, the waiting
 * list, snow dispatch, and a job's own Visits tab (job_view / job_add). The visit and job
 * routes only checked CRM access before, so any seat could reschedule, re-crew or complete
 * visits from the browser. Admins pass inside has_settings_permission.
 */
export const SCHEDULING_KEYS = [
  "sched_dispatch_board",
  "sched_waiting_list",
  "snow_dispatch_manage",
  "job_view",
  "job_add",
];

/** Returns a 403 response when the caller holds none of the scheduling keys, else null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rejectWithoutSchedulingPermission(supabase: any): Promise<NextResponse | null> {
  if (await hasAnySettingsPermission(supabase, SCHEDULING_KEYS)) return null;
  return NextResponse.json({ error: "You do not have permission to change the schedule" }, { status: 403 });
}
