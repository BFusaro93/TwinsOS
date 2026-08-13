import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import type { TriggerType } from "@/types/crm-automations";

/**
 * POST /api/automations/fire-trigger — fired best-effort from client mutation
 * hooks right after their own DB write succeeds (mirrors the ticket-notify
 * fetch pattern in src/lib/hooks/use-tickets.ts). Only trigger types with no
 * per-trigger config filtering of their own go through here — service-scoped
 * (service_visit_completed) and server-only (form_submitted,
 * contract_about_to_expire) triggers fire directly via fireSimpleTrigger from
 * their own server-side code path instead.
 */
const ALLOWED_TRIGGER_TYPES: ReadonlySet<TriggerType> = new Set([
  "tag_added",
  "tag_removed",
  "client_cancelled",
  "client_reactivated",
  "lead_converted_to_client",
  "estimate_created",
  "estimate_won",
  "estimate_lost",
  "ticket_created",
  "ticket_closed",
  "visit_cancelled",
  "visit_dispatched",
  "visit_skipped",
  "invoice_paid",
  "job_created",
  "client_source_updated",
  "has_opted_in_emails",
  "lead_cancelled",
  "ticket_reopened",
  "visit_date_changed",
  "client_created",
  "lead_created",
  "invoice_created",
  "job_cancelled",
  "package_created",
  "contract_created",
  "contract_signed",
  "client_referred",
  "damage_case_created",
  "payment_method_updated",
]);

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    triggerType?: string;
    clientId?: string;
    estimateId?: string;
    ticketId?: string;
    invoiceId?: string;
    matchValues?: string[];
  };
  if (!body.triggerType || !ALLOWED_TRIGGER_TYPES.has(body.triggerType as TriggerType)) {
    return NextResponse.json({ error: "unsupported triggerType" }, { status: 400 });
  }
  if (!body.clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;

  // Confirm the client actually belongs to the caller's org before firing —
  // this route runs with the caller's own RLS-scoped session, but org_id is
  // still worth double-checking explicitly rather than trusting the body.
  const { data: client } = await db.from("clients").select("org_id").eq("id", body.clientId).maybeSingle();
  if (!client || client.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Same cross-org guard for the ticket/invoice this event pertains to, if any.
  if (body.ticketId) {
    const { data: ticket } = await db.from("crm_tickets").select("org_id").eq("id", body.ticketId).maybeSingle();
    if (!ticket || ticket.org_id !== profile.org_id) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
  }
  if (body.invoiceId) {
    const { data: invoice } = await db.from("crm_invoices").select("org_id").eq("id", body.invoiceId).maybeSingle();
    if (!invoice || invoice.org_id !== profile.org_id) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
  }

  await fireSimpleTrigger(db, {
    orgId: profile.org_id,
    clientId: body.clientId,
    estimateId: body.estimateId ?? null,
    ticketId: body.ticketId ?? null,
    invoiceId: body.invoiceId ?? null,
    triggerType: body.triggerType as TriggerType,
    matchValues: Array.isArray(body.matchValues) ? body.matchValues.filter((v) => typeof v === "string") : undefined,
  });

  return NextResponse.json({ ok: true });
}
