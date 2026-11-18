import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { markEstimateFirstSent } from "@/lib/estimates/estimate-sent";

/**
 * POST /api/crm/estimates/[id]/mark-sent — called by useUpdateEstimateStage right after
 * a manual move to Sent (Detail stage picker, kanban drag, bulk stage change). The
 * browser can't be trusted to say "this is the first send", so the server checks it:
 * markEstimateFirstSent stamps sent_at and fires "Estimate was sent" only when the
 * estimate really is in Sent now and has never been sent before. Calling it again (or
 * for an estimate that isn't in Sent) does nothing.
 *
 * Runs on the caller's own session: RLS scopes the estimate to their org, and the
 * stamp needs the same estimate_edit / estimate_send permission as the stage change.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const firstSend = await markEstimateFirstSent(supabase, id, orgId);
  return NextResponse.json({ ok: true, firstSend });
}
