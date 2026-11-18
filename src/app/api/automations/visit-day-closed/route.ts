import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { fireVisitDayCompletedTriggers } from "@/lib/automations/visit-day-completed";

const BodySchema = z.object({
  visitId: z.string().uuid(),
  /** The service day that may now be finished: the visit's day, or its OLD day after a move. */
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Crew logins fire nothing from the browser; their own server routes do. */
const BLOCKED_ROLES: ReadonlySet<string> = new Set(["crew"]);

/**
 * POST /api/automations/visit-day-closed — called best-effort by the visit hooks
 * after skipping, cancelling or moving a visit. If that left the client's service day
 * finished (no open visit that day, at least one completed), visit_completed /
 * service_visit_completed fire for the day (fireVisitDayCompletedTriggers). Nothing
 * in the request is trusted beyond picking the day: the visit is read with the
 * caller's RLS session and must be in the caller's org, the client comes from the
 * visit, and the day's state is read from the database.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "visitId and visitDate are required" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role && BLOCKED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Your role cannot fire automation triggers" }, { status: 403 });
  }
  const orgId: string = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;
  const { data: visit } = await db
    .from("crm_job_visits")
    .select("org_id, client_id")
    .eq("id", parsed.data.visitId)
    .maybeSingle();
  if (!visit || visit.org_id !== orgId || !visit.client_id) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  if (!(await checkAuthRateLimit(`day-closed:${user.id}:${visit.client_id}:${parsed.data.visitDate}`, 5, 600))) {
    return NextResponse.json({ error: "Try again in a few minutes." }, { status: 429 });
  }

  await fireVisitDayCompletedTriggers(db, { orgId, clientId: visit.client_id as string, visitDate: parsed.data.visitDate });
  return NextResponse.json({ ok: true });
}
