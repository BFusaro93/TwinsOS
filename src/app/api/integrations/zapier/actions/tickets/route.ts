import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";

const createTicketSchema = z.object({
  clientId: z.string().uuid(),
  subject: z.string().min(1),
  body: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  dueDate: z.string().optional(),
});

/**
 * POST /api/integrations/zapier/actions/tickets — Zapier action ("Create
 * Ticket"). clientId must belong to the authenticated org — checked
 * explicitly rather than trusted from the body, same guard as
 * /api/automations/fire-trigger.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const parsed = createTicketSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  const { data: client } = await db
    .from("clients")
    .select("org_id")
    .eq("id", body.clientId)
    .maybeSingle();
  if (!client || client.org_id !== auth.orgId) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("crm_tickets")
    .insert({
      org_id: auth.orgId,
      client_id: body.clientId,
      subject: body.subject,
      body: body.body ?? null,
      priority: body.priority ?? "normal",
      category: body.category ?? null,
      type: body.type ?? "note",
      due_date: body.dueDate ?? null,
      status: "open",
    })
    .select("id, ticket_number, subject, status, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    ticketNumber: data.ticket_number,
    subject: data.subject,
    status: data.status,
    createdAt: data.created_at,
  });
}
