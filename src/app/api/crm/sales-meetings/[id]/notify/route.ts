import { NextResponse } from "next/server";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { notifyMeetingAssigned } from "@/lib/sales-meeting-notify";

/**
 * POST /api/crm/sales-meetings/[id]/notify
 *
 * Fired best-effort from useCreateSalesMeeting / useUpdateSalesMeeting after
 * the DB write already succeeded — same shape as /api/crm/tickets/[id]/notify.
 * Body: { event: "assigned" }. Only honored for a meeting in the caller's org
 * that was written in the last few minutes, and at most once per rep per
 * meeting in that window.
 */

const NOTIFY_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!callerProfile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const { data: hasCrmAccess } = await supabase.rpc("has_crm_access");
  if (!hasCrmAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: meetingId } = await params;
  let body: { event?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.event !== "assigned") return NextResponse.json({ error: "Unknown event" }, { status: 400 });

  const admin = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: meeting } = await (admin as any)
    .from("crm_sales_meetings")
    .select("id, org_id, title, scheduled_at, location, lead_name, sales_rep_id, updated_at, clients(display_name)")
    .eq("id", meetingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!meeting || meeting.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (Date.now() - new Date(meeting.updated_at as string).getTime() > NOTIFY_WINDOW_MS) {
    return NextResponse.json({ error: "Meeting was not just assigned" }, { status: 403 });
  }

  // Dedupe retries / double-fires for the same assignment.
  const since = new Date(Date.now() - NOTIFY_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", meeting.org_id)
    .eq("entity_id", meetingId)
    .eq("type", "sales_meeting_assigned")
    .gte("created_at", since);
  if ((count ?? 0) > 0) return NextResponse.json({ success: true, skipped: "already_notified" });

  await notifyMeetingAssigned(admin, {
    orgId: meeting.org_id as string,
    meetingId,
    title: meeting.title as string,
    scheduledAt: meeting.scheduled_at as string,
    location: (meeting.location as string | null) ?? null,
    clientName: (meeting.clients?.display_name as string | undefined) ?? (meeting.lead_name as string | null) ?? "a new lead",
    repEmployeeId: meeting.sales_rep_id as string,
    assignerUserId: user.id,
  });

  return NextResponse.json({ success: true });
}
