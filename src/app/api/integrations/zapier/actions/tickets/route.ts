import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, blankToUndefined, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { notifyStaffOfNewTicket } from "@/lib/ticket-notify";
import { logger } from "@/lib/logger";
import { firstIssueMessage } from "@/lib/utils/zod-message";

const log = logger.child("zapier-action");

// Optional fields tolerate Zapier's "" for an unmapped field (see blankToUndefined).
const createTicketSchema = z.object({
  clientId: z.string().uuid(),
  subject: z.string().min(1),
  body: blankToUndefined(z.string()),
  priority: blankToUndefined(
    z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .pipe(z.enum(["low", "normal", "high", "urgent"], { message: "priority must be low, normal, high or urgent" }))
  ),
  category: blankToUndefined(z.string()),
  type: blankToUndefined(z.string()),
  // due_date is a `date` column: an unvalidated string failed the insert as an opaque 500.
  dueDate: blankToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD")),
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
    return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid input") }, { status: 400 });
  }
  const body = parsed.data;

  const { data: client } = await db
    .from("clients")
    .select("org_id")
    .eq("id", body.clientId)
    .is("deleted_at", null)
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
    // Don't hand raw database errors (constraint/column names) to the caller.
    log.error("create ticket failed", { error: error?.message });
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }

  // Same follow-through as the in-app New Ticket dialog (useCreateTicket): a
  // client-timeline row, the staff "new ticket" notification, and the
  // ticket_created automation trigger (which also feeds Zapier REST hooks).
  // All best-effort — the ticket already exists.
  const { error: activityError } = await db.from("client_activity").insert({
    org_id: auth.orgId,
    client_id: body.clientId,
    activity_type: "ticket",
    subject: body.subject,
    body: body.body ?? null,
    status: "open",
    ref_id: data.id,
    ref_table: "crm_tickets",
  });
  if (activityError) log.error("ticket activity insert failed", { ticketId: data.id, error: activityError.message });
  try {
    await notifyStaffOfNewTicket(db, {
      orgId: auth.orgId,
      ticketId: data.id as string,
      ticketNumber: data.ticket_number as number,
      subject: data.subject as string | null,
      assignedToName: null,
      createdByUserId: null,
      source: "Zapier",
    });
  } catch (e) {
    log.error("ticket notify failed", { ticketId: data.id, error: e instanceof Error ? e.message : String(e) });
  }
  try {
    await fireSimpleTrigger(db, {
      orgId: auth.orgId,
      clientId: body.clientId,
      ticketId: data.id as string,
      triggerType: "ticket_created",
      matchValues: body.category ? [body.category] : undefined,
    });
  } catch {
    // enrollment failure must not fail the create
  }

  return NextResponse.json({
    id: data.id,
    ticketNumber: data.ticket_number,
    subject: data.subject,
    status: data.status,
    createdAt: data.created_at,
  });
}
