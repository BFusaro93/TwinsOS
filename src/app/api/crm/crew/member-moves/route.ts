import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { closeMemberPunchesOnOtherCrews } from "@/lib/crew/member-moves";
import { isPayrollLockedError } from "@/lib/crew/payroll-lock";

/**
 * POST /api/crm/crew/member-moves — the office moved a crew member onto
 * another crew for today (Crew Board / dispatch board Team Assignment), or
 * cleared today's placement. Closes the member's OPEN job punches on every
 * visit that isn't the new crew's, at the server's now, so the old crew's job
 * stops accruing their time (see closeMemberPunchesOnOtherCrews).
 *
 * Punch writes need Dispatch Board or Payroll under RLS, so the browser used
 * to close them under its own session and a Teams-only user silently closed
 * nothing — the member was then paid on two jobs. Now: the caller must be able
 * to manage the roster (sched_teams, sched_dispatch_board or payroll_report;
 * admins pass) and the close is written with the service role. A caller
 * without those keys gets a 403 instead of a silent no-op. Crew logins move
 * members through /api/crm/crew/day (add_member), not here.
 *
 * newCrewId null = the member is on no crew today: every open job punch closes.
 */
const Body = z.object({
  memberId: z.string().uuid(),
  newCrewId: z.string().uuid().nullable(),
});

const ROSTER_KEYS = ["sched_teams", "sched_dispatch_board", "payroll_report"];

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { memberId, newCrewId } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });
  if (profile.role === "crew") {
    return NextResponse.json({ error: "Crew logins move people with Edit Crew in the crew app" }, { status: 403 });
  }
  if (!(await hasAnySettingsPermission(supabase, ROSTER_KEYS))) {
    return NextResponse.json(
      { error: "Moving people between crews needs the Teams, Dispatch Board or Payroll permission" },
      { status: 403 }
    );
  }

  // Org scoping is RLS's job (my_org_id(), impersonation-aware): a member or
  // crew outside the caller's org simply isn't found.
  const { data: member } = await db.from("crm_crew_members").select("id, org_id").eq("id", memberId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });
  if (newCrewId) {
    const { data: crew } = await db.from("crm_crews").select("id").eq("id", newCrewId).eq("org_id", member.org_id).maybeSingle();
    if (!crew) return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }
  const readOnly = await assertOrgWritable(createServiceClient(), member.org_id as string);
  if (readOnly) return readOnly;

  try {
    // newCrewId "" matches no visit's crew, so every open job punch closes.
    const closed = await closeMemberPunchesOnOtherCrews(createServiceClient(), {
      memberId,
      newCrewId: newCrewId ?? "",
      at: new Date().toISOString(),
    });
    return NextResponse.json({ closed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to close the member's open punches";
    return NextResponse.json({ error: message }, { status: isPayrollLockedError(message) ? 409 : 500 });
  }
}
