import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { notifyStaffOfNewTicket, notifyTicketAssigned, notifyTicketComment } from "@/lib/ticket-notify";

/**
 * POST /api/crm/tickets/[id]/notify
 *
 * Fired best-effort from client mutation hooks (useCreateTicket,
 * useUpdateTicket, useAddComment) after the DB write already succeeded —
 * mirrors useSubmitForApproval's fetch("/api/approval-requests/notify").
 * Body: { event: "created" | "assigned" | "comment"; commentBody?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!callerProfile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const { id: ticketId } = await params;
  let body: { event?: string; commentBody?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.event) return NextResponse.json({ error: "event is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: ticket } = await adminClient
    .from("crm_tickets")
    .select("id, org_id, ticket_number, subject, assigned_to, assigned_to_id, created_by")
    .eq("id", ticketId)
    .single();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  // adminClient is service-role and bypasses RLS entirely — without this
  // check, any authenticated user (any org) could POST an event for a
  // ticket id belonging to a different org and trigger real staff
  // email/notification sends referencing that org's ticket data.
  if (ticket.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const base = {
    orgId: ticket.org_id as string,
    ticketId: ticket.id as string,
    ticketNumber: ticket.ticket_number as number,
    subject: ticket.subject as string | null,
    assignedToId: ticket.assigned_to_id as string | null,
  };

  if (body.event === "created") {
    await notifyStaffOfNewTicket(adminClient, {
      ...base,
      assignedToName: ticket.assigned_to as string | null,
      createdByUserId: ticket.created_by as string | null,
    });
  } else if (body.event === "assigned") {
    await notifyTicketAssigned(adminClient, { ...base, assignedToName: ticket.assigned_to as string | null });
  } else if (body.event === "comment") {
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
    await notifyTicketComment(adminClient, {
      ...base,
      assignedToName: ticket.assigned_to as string | null,
      commenterName: profile?.name ?? "Someone",
      commenterId: user.id,
      commentBody: body.commentBody ?? "",
    });
  } else {
    return NextResponse.json({ error: `Unknown event: ${body.event}` }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
