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
 * Body: { event: "created" | "assigned" | "comment"; commentId?: string }
 *
 * The comment body is loaded server-side from commentId (it used to be taken
 * from the request, so any member could email arbitrary text under the
 * ticket's name). "created" and "comment" are only honored for the caller's
 * own, freshly written ticket/comment, and "created" only once per ticket.
 */

// How long after the ticket/comment write a notify call is still accepted.
const NOTIFY_WINDOW_MS = 10 * 60 * 1000;

function isFresh(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() <= NOTIFY_WINDOW_MS;
}
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

  // Tickets are Landscapt/CRM records — same gate as their RLS.
  const { data: hasCrmAccess } = await supabase.rpc("has_crm_access");
  if (!hasCrmAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: ticketId } = await params;
  let body: { event?: string; commentId?: string };
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
    .select("id, org_id, ticket_number, subject, assigned_to, assigned_to_id, created_by, created_at")
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
    if (ticket.created_by !== user.id || !isFresh(ticket.created_at as string | null)) {
      return NextResponse.json({ error: "Only a ticket's creator can announce it, right after creating it" }, { status: 403 });
    }
    // Once per ticket: the broadcast writes ticket_created in-app rows.
    const { count: alreadySent } = await adminClient
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ticket.org_id)
      .eq("entity_id", ticket.id)
      .eq("type", "ticket_created");
    if ((alreadySent ?? 0) > 0) return NextResponse.json({ success: true, skipped: "already_notified" });
    await notifyStaffOfNewTicket(adminClient, {
      ...base,
      assignedToName: ticket.assigned_to as string | null,
      createdByUserId: ticket.created_by as string | null,
    });
  } else if (body.event === "assigned") {
    await notifyTicketAssigned(adminClient, { ...base, assignedToName: ticket.assigned_to as string | null, assignedByUserId: user.id });
  } else if (body.event === "comment") {
    if (!body.commentId) return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    const { data: comment } = await adminClient
      .from("comments")
      .select("id, org_id, record_type, record_id, author_id, body, created_at")
      .eq("id", body.commentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (
      !comment ||
      comment.org_id !== ticket.org_id ||
      comment.record_type !== "ticket" ||
      comment.record_id !== ticket.id ||
      comment.author_id !== user.id ||
      !isFresh(comment.created_at as string | null)
    ) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
    await notifyTicketComment(adminClient, {
      ...base,
      assignedToName: ticket.assigned_to as string | null,
      commenterName: profile?.name ?? "Someone",
      commenterId: user.id,
      commentBody: (comment.body as string | null) ?? "",
    });
  } else {
    return NextResponse.json({ error: `Unknown event: ${body.event}` }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
