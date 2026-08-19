import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest } from "@/lib/integrations/zapier";

/**
 * GET /api/integrations/zapier/triggers/tickets — Zapier polling trigger
 * ("New Ticket"). Returns the most recently created tickets, newest first.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const { data, error } = await db
    .from("crm_tickets")
    .select("id, ticket_number, client_id, subject, body, status, priority, category, type, due_date, created_at")
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tickets = (data ?? []).map((t) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    clientId: t.client_id,
    subject: t.subject,
    body: t.body,
    status: t.status,
    priority: t.priority,
    category: t.category,
    type: t.type,
    dueDate: t.due_date,
    createdAt: t.created_at,
  }));

  return NextResponse.json(tickets);
}
