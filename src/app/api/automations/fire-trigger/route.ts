import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { logger } from "@/lib/logger";
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
  "has_opted_in_sms",
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

/**
 * profiles.role values that may never fire customer-facing triggers from the
 * browser. Crew logins are per-crew field accounts; their own server routes
 * (e.g. crew visit skip) fire whatever automations apply. viewer/requestor are
 * deliberately NOT listed: profiles.role limits are Equipt-only, and a
 * viewer can hold a Landscapt crm_role that legitimately edits clients/tags
 * (which fire triggers). Landscapt access itself is enforced by RLS on the
 * client lookup below (has_crm_access()).
 */
const BLOCKED_ROLES: ReadonlySet<string> = new Set(["crew"]);

/**
 * High-impact triggers whose premise is checkable from the record itself.
 * The caller must pass the record id, and the record must belong to the
 * client and actually be in the claimed state — otherwise any org member
 * could send e.g. a "thanks for your payment" email for an unpaid invoice.
 */
type VerifiedTrigger = {
  idField: "invoiceId" | "estimateId" | "ticketId";
  table: "crm_invoices" | "estimates" | "crm_tickets";
  column: "status" | "stage";
  isTrue: (value: string | null) => boolean;
  label: string;
};
const VERIFIED_TRIGGERS: Partial<Record<TriggerType, VerifiedTrigger>> = {
  invoice_paid: {
    idField: "invoiceId", table: "crm_invoices", column: "status",
    isTrue: (v) => v === "paid", label: "invoice is not paid",
  },
  // The accept flow can convert straight on to "invoiced", so both count as won.
  estimate_won: {
    idField: "estimateId", table: "estimates", column: "stage",
    isTrue: (v) => v === "accepted" || v === "invoiced", label: "estimate is not accepted",
  },
  estimate_lost: {
    idField: "estimateId", table: "estimates", column: "stage",
    isTrue: (v) => v === "lost", label: "estimate is not lost",
  },
  ticket_closed: {
    idField: "ticketId", table: "crm_tickets", column: "status",
    isTrue: (v) => v === "closed", label: "ticket is not closed",
  },
  ticket_reopened: {
    idField: "ticketId", table: "crm_tickets", column: "status",
    isTrue: (v) => v !== null && v !== "closed", label: "ticket is not open",
  },
};

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

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role && BLOCKED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Your role cannot fire automation triggers" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;

  // Confirm the client actually belongs to the caller's org before firing —
  // this route runs with the caller's own RLS-scoped session, but org_id is
  // still worth double-checking explicitly rather than trusting the body.
  const { data: client } = await db.from("clients").select("org_id").eq("id", body.clientId).maybeSingle();
  if (!client || client.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Same cross-org guard for the estimate/ticket/invoice this event pertains to, if any.
  if (body.estimateId) {
    const { data: estimate } = await db.from("estimates").select("org_id").eq("id", body.estimateId).maybeSingle();
    if (!estimate || estimate.org_id !== profile.org_id) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }
  }
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

  // Server-side check that the event actually happened, for the triggers
  // where the record can prove it (see VERIFIED_TRIGGERS).
  const verify = VERIFIED_TRIGGERS[body.triggerType as TriggerType];
  if (verify) {
    const recordId = body[verify.idField];
    if (!recordId) {
      return NextResponse.json({ error: `${verify.idField} is required for ${body.triggerType}` }, { status: 400 });
    }
    const { data: record } = await db
      .from(verify.table)
      .select(`client_id, ${verify.column}`)
      .eq("id", recordId)
      .maybeSingle();
    if (!record || record.client_id !== body.clientId) {
      return NextResponse.json({ error: "Record does not belong to this client" }, { status: 409 });
    }
    if (!verify.isTrue((record[verify.column] as string | null) ?? null)) {
      return NextResponse.json(
        { error: `Cannot fire ${body.triggerType}: ${verify.label}` },
        { status: 409 }
      );
    }
  }

  const enrollmentIds = await fireSimpleTrigger(db, {
    orgId: profile.org_id,
    clientId: body.clientId,
    estimateId: body.estimateId ?? null,
    ticketId: body.ticketId ?? null,
    invoiceId: body.invoiceId ?? null,
    triggerType: body.triggerType as TriggerType,
    matchValues: Array.isArray(body.matchValues) ? body.matchValues.filter((v) => typeof v === "string") : undefined,
  });

  // Send any step that's due right now (an email with no wait in front of
  // it) instead of leaving it for the next /api/automations/run sweep — same
  // as the visit-completed path. Service role: the processor writes to
  // tables the caller's RLS session doesn't cover. Only ids this request
  // just created (for the caller's verified org) are processed.
  if (enrollmentIds.length > 0) {
    const admin = createServiceClient();
    for (const enrollmentId of enrollmentIds) {
      try {
        await processEnrollmentImmediately(admin, enrollmentId);
      } catch (err) {
        logger.error("[fire-trigger] immediate processing failed", {
          enrollmentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
