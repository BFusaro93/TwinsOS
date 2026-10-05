import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { notifyInjuryReported } from "@/lib/injury-notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/injury-cases/[id]/notify
 *
 * Fired best-effort from useCreateInjuryCase after the insert already
 * succeeded (same pattern as /api/comments/mention-notify). The caller must
 * have created this case themselves within the last 10 minutes, in their own
 * org — so the route can't be used to ping colleagues about arbitrary cases or
 * to re-send an old alert.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: injuryCase } = await (db as any)
    .from("injury_cases")
    .select("id, incident_type, employee_name, supervisor_name, date_of_incident, location, severity, created_by, created_at")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (
    !injuryCase ||
    injuryCase.created_by !== user.id ||
    Date.now() - new Date(injuryCase.created_at).getTime() > 10 * 60 * 1000
  ) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const result = await notifyInjuryReported(db, {
    orgId: profile.org_id as string,
    reporterId: user.id,
    injuryCase,
  });
  return NextResponse.json({ success: true, ...result });
}
