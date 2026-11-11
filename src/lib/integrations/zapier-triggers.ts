import type { ZapierCrmTriggerType, ZapierTriggerType } from "@/lib/integrations/zapier";

/**
 * Polling-trigger definition for one ZapierTriggerType — the fallback path
 * Zapier uses to test a trigger and to backfill/dedupe around REST Hook
 * delivery gaps. Every trigger type Zapier can subscribe to (see
 * ZAPIER_TRIGGER_TYPES) needs one of these so the Zapier app's "Test" step
 * always has something to show, even for orgs that haven't set up a hook yet.
 */
export interface PollingTriggerConfig {
  table: string;
  columns: string;
  /** Additional eq() filters beyond org_id + deleted_at (when the table has one). */
  filters?: Record<string, string | boolean>;
  /** Columns that must be non-null for a row to count as "the event happened" (e.g. signed_at, dispatched_at). */
  requireNotNull?: string[];
  hasSoftDelete: boolean;
  orderBy: string;
  /**
   * In-memory filter applied after fetch, for conditions PostgREST can't
   * express as a simple column-vs-literal eq() — e.g. comparing two columns
   * on the same row (quantity_on_hand vs minimum_stock), "due by today"
   * (next_due_date vs now), or a threshold check parameterized by the Zap
   * author's own trigger input fields (meter_threshold's meterId/threshold/
   * operator query params). Fetches a wider page (500) before filtering and
   * slicing to the usual page size, since the filter can reject most rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postFilter?: (row: any, searchParams: URLSearchParams, ctx: { orgToday: string }) => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: (row: any) => Record<string, unknown>;
}

/**
 * Re-firing events (a client cancelled again, an invoice paid again) need an
 * id that changes per occurrence, or Zapier's dedupe swallows the second one.
 * Events from before this cutoff keep the bare record id they were already
 * delivered under — switching every listed item's id at once would make
 * existing Zaps re-run for the whole page. Set to the release date.
 */
const EVENT_KEYED_IDS_FROM = "2026-11-11T00:00:00Z";

/** `<recordId>:<event time>` for events at/after the cutoff, the bare id before it. */
function eventKeyedId(recordId: string, eventAt: string | null | undefined): string {
  if (!eventAt || Date.parse(eventAt) < Date.parse(EVENT_KEYED_IDS_FROM)) return recordId;
  return `${recordId}:${eventAt}`;
}

export const POLLING_TRIGGERS: Record<ZapierTriggerType, PollingTriggerConfig> = {
  client_created: {
    table: "clients",
    columns: "id, display_name, first_name, last_name, primary_email, primary_phone, status, account_type, source, client_since, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (c) => ({
      id: c.id, displayName: c.display_name, firstName: c.first_name, lastName: c.last_name,
      email: c.primary_email, phone: c.primary_phone, status: c.status, accountType: c.account_type,
      source: c.source, clientSince: c.client_since, createdAt: c.created_at,
    }),
  },
  lead_created: {
    table: "clients",
    columns: "id, display_name, first_name, last_name, primary_email, primary_phone, source, created_at",
    filters: { status: "lead" },
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (c) => ({
      id: c.id, displayName: c.display_name, firstName: c.first_name, lastName: c.last_name,
      email: c.primary_email, phone: c.primary_phone, source: c.source, createdAt: c.created_at,
    }),
  },
  lead_converted_to_client: {
    table: "clients",
    columns: "id, display_name, primary_email, primary_phone, client_since, updated_at",
    filters: { status: "active" },
    // Ordered by when the client converted, not by updated_at: any edit to an
    // old active client used to bump it to the top of the page.
    requireNotNull: ["client_since"],
    hasSoftDelete: true,
    orderBy: "client_since",
    map: (c) => ({
      id: c.id, displayName: c.display_name, email: c.primary_email, phone: c.primary_phone,
      clientSince: c.client_since, updatedAt: c.updated_at,
    }),
  },
  client_cancelled: {
    table: "clients",
    columns: "id, display_name, cancellation_reason, closed_at, updated_at",
    filters: { status: "cancelled" },
    hasSoftDelete: true,
    orderBy: "updated_at",
    // One event per cancellation (closed_at is stamped each time), so a client
    // reactivated and cancelled again triggers again; clientId is the client.
    map: (c) => ({
      id: eventKeyedId(c.id, c.closed_at), clientId: c.id, displayName: c.display_name,
      cancellationReason: c.cancellation_reason, closedAt: c.closed_at, updatedAt: c.updated_at,
    }),
  },
  estimate_created: {
    table: "estimates",
    columns: "id, estimate_number, client_id, stage, description, estimate_date, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (e) => ({
      id: e.id, estimateNumber: e.estimate_number, clientId: e.client_id, stage: e.stage,
      description: e.description, estimateDate: e.estimate_date, createdAt: e.created_at,
    }),
  },
  estimate_won: {
    table: "estimates",
    columns: "id, estimate_number, client_id, stage, description, estimate_date, updated_at",
    hasSoftDelete: true,
    orderBy: "updated_at",
    // There is no "won" stage: a won estimate is "accepted" (or "invoiced" once
    // the accept flow converts it straight on) — the same rule the app's
    // estimate_won trigger checks. Filtering on stage "won" matched nothing.
    postFilter: (e) => e.stage === "accepted" || e.stage === "invoiced",
    map: (e) => ({
      id: e.id, estimateNumber: e.estimate_number, clientId: e.client_id,
      description: e.description, estimateDate: e.estimate_date, updatedAt: e.updated_at,
    }),
  },
  estimate_lost: {
    table: "estimates",
    columns: "id, estimate_number, client_id, description, estimate_date, updated_at",
    filters: { stage: "lost" },
    hasSoftDelete: true,
    orderBy: "updated_at",
    map: (e) => ({
      id: e.id, estimateNumber: e.estimate_number, clientId: e.client_id,
      description: e.description, estimateDate: e.estimate_date, updatedAt: e.updated_at,
    }),
  },
  job_created: {
    table: "crm_jobs",
    columns: "id, job_number, client_id, job_type, status, scheduled_date, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (j) => ({
      id: j.id, jobNumber: j.job_number, clientId: j.client_id, jobType: j.job_type,
      status: j.status, scheduledDate: j.scheduled_date, createdAt: j.created_at,
    }),
  },
  ticket_created: {
    table: "crm_tickets",
    columns: "id, ticket_number, client_id, subject, body, status, priority, category, type, due_date, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (t) => ({
      id: t.id, ticketNumber: t.ticket_number, clientId: t.client_id, subject: t.subject,
      body: t.body, status: t.status, priority: t.priority, category: t.category, type: t.type,
      dueDate: t.due_date, createdAt: t.created_at,
    }),
  },
  ticket_closed: {
    table: "crm_tickets",
    columns: "id, ticket_number, client_id, subject, priority, closed_at",
    filters: { status: "closed" },
    hasSoftDelete: true,
    orderBy: "closed_at",
    map: (t) => ({
      id: t.id, ticketNumber: t.ticket_number, clientId: t.client_id, subject: t.subject,
      priority: t.priority, closedAt: t.closed_at,
    }),
  },
  invoice_created: {
    table: "crm_invoices",
    columns: "id, invoice_number, client_id, invoice_date, due_date, status, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (i) => ({
      id: i.id, invoiceNumber: i.invoice_number, clientId: i.client_id, invoiceDate: i.invoice_date,
      dueDate: i.due_date, status: i.status, createdAt: i.created_at,
    }),
  },
  invoice_paid: {
    table: "crm_invoices",
    columns:
      "id, invoice_number, client_id, invoice_date, due_date, status, amount_paid_cents, balance_cents, created_at, crm_payment_allocations(created_at)",
    filters: { status: "paid" },
    hasSoftDelete: true,
    // crm_invoices has no paid_at; updated_at is when it last changed, which
    // includes going paid. Ordering by invoice_date never surfaced an old
    // invoice paid today.
    orderBy: "updated_at",
    // The event time is the newest payment applied to it — not updated_at, so
    // an edit to a paid invoice doesn't re-fire, but a refund followed by a new
    // payment does (a bare invoice id fired once ever). invoiceId is the invoice.
    map: (i) => {
      const paidAt =
        ((i.crm_payment_allocations ?? []) as { created_at: string | null }[])
          .map((a) => a.created_at)
          .filter((t): t is string => !!t)
          .sort()
          .pop() ?? null;
      return {
        id: eventKeyedId(i.id, paidAt), invoiceId: i.id, invoiceNumber: i.invoice_number, clientId: i.client_id,
        invoiceDate: i.invoice_date, dueDate: i.due_date, status: i.status, amountPaidCents: i.amount_paid_cents,
        balanceCents: i.balance_cents, paidAt, createdAt: i.created_at,
      };
    },
  },
  contract_signed: {
    table: "crm_contracts",
    columns: "id, title, client_id, monthly_amount_cents, signed_at, signed_by, start_date",
    requireNotNull: ["signed_at"],
    hasSoftDelete: true,
    orderBy: "signed_at",
    map: (c) => ({
      id: c.id, title: c.title, clientId: c.client_id, monthlyAmountCents: c.monthly_amount_cents,
      signedAt: c.signed_at, signedBy: c.signed_by, startDate: c.start_date,
    }),
  },
  damage_case_created: {
    table: "damage_cases",
    columns: "id, case_number, case_type, customer_name, date_of_incident, description, status, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (d) => ({
      id: d.id, caseNumber: d.case_number, caseType: d.case_type, customerName: d.customer_name,
      dateOfIncident: d.date_of_incident, description: d.description, status: d.status, createdAt: d.created_at,
    }),
  },
  visit_dispatched: {
    table: "crm_job_visits",
    columns: "id, job_id, client_id, crew_id, assigned_employee_id, dispatched_at",
    requireNotNull: ["dispatched_at"],
    hasSoftDelete: true,
    orderBy: "dispatched_at",
    map: (v) => ({
      id: v.id, jobId: v.job_id, clientId: v.client_id, crewId: v.crew_id,
      assignedEmployeeId: v.assigned_employee_id, dispatchedAt: v.dispatched_at,
    }),
  },

  // ── Equipt / CMMS ──────────────────────────────────────────────────────────

  asset_created: {
    table: "assets",
    columns: "id, name, asset_tag, asset_type, status, location, manufacturer, model, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (a) => ({
      id: a.id, name: a.name, assetTag: a.asset_tag, assetType: a.asset_type, status: a.status,
      location: a.location, manufacturer: a.manufacturer, model: a.model, createdAt: a.created_at,
    }),
  },
  work_order_created: {
    table: "work_orders",
    columns: "id, work_order_number, title, asset_id, asset_name, status, priority, wo_type, due_date, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (w) => ({
      id: w.id, workOrderNumber: w.work_order_number, title: w.title, assetId: w.asset_id,
      assetName: w.asset_name, status: w.status, priority: w.priority, woType: w.wo_type,
      dueDate: w.due_date, createdAt: w.created_at,
    }),
  },
  work_order_completed: {
    table: "work_orders",
    columns: "id, work_order_number, title, asset_id, asset_name, priority, completed_at, updated_at",
    filters: { status: "done" },
    // completed_at, not updated_at: editing an old done work order reported it
    // as "completed" again with the edit time.
    requireNotNull: ["completed_at"],
    hasSoftDelete: true,
    orderBy: "completed_at",
    map: (w) => ({
      id: w.id, workOrderNumber: w.work_order_number, title: w.title, assetId: w.asset_id,
      assetName: w.asset_name, priority: w.priority, completedAt: w.completed_at ?? w.updated_at,
    }),
  },
  requisition_created: {
    table: "requisitions",
    columns: "id, requisition_number, title, status, vendor_id, vendor_name, work_order_id, grand_total, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (r) => ({
      id: r.id, requisitionNumber: r.requisition_number, title: r.title, status: r.status,
      vendorId: r.vendor_id, vendorName: r.vendor_name, workOrderId: r.work_order_id,
      grandTotalCents: r.grand_total, createdAt: r.created_at,
    }),
  },
  po_created: {
    table: "purchase_orders",
    columns: "id, po_number, status, vendor_id, vendor_name, requisition_id, grand_total, po_date, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (p) => ({
      id: p.id, poNumber: p.po_number, status: p.status, vendorId: p.vendor_id, vendorName: p.vendor_name,
      requisitionId: p.requisition_id, grandTotalCents: p.grand_total, poDate: p.po_date, createdAt: p.created_at,
    }),
  },
  po_approved: {
    table: "purchase_orders",
    columns: "id, po_number, vendor_id, vendor_name, grand_total, updated_at",
    filters: { status: "approved" },
    hasSoftDelete: true,
    orderBy: "updated_at",
    map: (p) => ({
      id: p.id, poNumber: p.po_number, vendorId: p.vendor_id, vendorName: p.vendor_name,
      grandTotalCents: p.grand_total, approvedAt: p.updated_at,
    }),
  },
  pm_schedule_due: {
    table: "pm_schedules",
    columns: "id, title, asset_id, asset_name, frequency, next_due_date, last_completed_date",
    filters: { is_active: true },
    hasSoftDelete: true,
    orderBy: "next_due_date",
    // next_due_date is an org-calendar date; compare as YYYY-MM-DD strings
    // against the org's today (parsing it as a Date meant UTC midnight).
    postFilter: (p, _searchParams, { orgToday }) => !!p.next_due_date && p.next_due_date <= orgToday,
    // Zapier dedupes on id, so a bare schedule id fired once EVER — the next
    // due date never triggered. One event per schedule per due date; the
    // schedule's own id is scheduleId.
    map: (p) => ({
      id: `${p.id}:${p.next_due_date}`, scheduleId: p.id,
      title: p.title, assetId: p.asset_id, assetName: p.asset_name, frequency: p.frequency,
      nextDueDate: p.next_due_date, lastCompletedDate: p.last_completed_date,
    }),
  },
  part_low_stock: {
    table: "parts",
    columns: "id, name, part_number, category, quantity_on_hand, minimum_stock, vendor_id, vendor_name, updated_at",
    hasSoftDelete: true,
    orderBy: "updated_at",
    postFilter: (p) => Number(p.quantity_on_hand) <= Number(p.minimum_stock),
    // One event per change while low (a bare part id fired once ever, so a
    // part restocked and run low again never re-alerted); partId is the part.
    map: (p) => ({
      id: `${p.id}:${p.updated_at}`, partId: p.id,
      name: p.name, partNumber: p.part_number, category: p.category,
      quantityOnHand: p.quantity_on_hand, minimumStock: p.minimum_stock,
      vendorId: p.vendor_id, vendorName: p.vendor_name,
    }),
  },
  vendor_created: {
    table: "vendors",
    columns: "id, name, contact_name, email, phone, vendor_type, is_active, created_at",
    hasSoftDelete: true,
    orderBy: "created_at",
    map: (v) => ({
      id: v.id, name: v.name, contactName: v.contact_name, email: v.email, phone: v.phone,
      vendorType: v.vendor_type, isActive: v.is_active, createdAt: v.created_at,
    }),
  },
  meter_threshold: {
    table: "meters",
    columns: "id, name, unit, current_value, asset_id, asset_name, last_reading_at, updated_at",
    hasSoftDelete: true,
    orderBy: "updated_at",
    // Query params (set by the Zap author when configuring the trigger):
    //   meterId    — restrict to one meter (omit to check all of the org's meters)
    //   threshold  — the value to compare against (omit to just list current meter values)
    //   operator   — "gte" (default) or "lte"
    postFilter: (m, searchParams) => {
      const meterId = searchParams.get("meterId");
      if (meterId && m.id !== meterId) return false;
      const thresholdParam = searchParams.get("threshold");
      if (thresholdParam === null) return true;
      const threshold = Number(thresholdParam);
      const operator = searchParams.get("operator") === "lte" ? "lte" : "gte";
      const value = Number(m.current_value);
      return operator === "lte" ? value <= threshold : value >= threshold;
    },
    // One event per reading (a bare meter id fired once ever); meterId is the meter.
    map: (m) => ({
      id: `${m.id}:${m.last_reading_at ?? m.updated_at}`, meterId: m.id,
      name: m.name, unit: m.unit, currentValue: m.current_value, assetId: m.asset_id,
      assetName: m.asset_name, lastReadingAt: m.last_reading_at, updatedAt: m.updated_at,
    }),
  },
};

// ── Live (REST hook) payloads ────────────────────────────────────────────────

/** The ids fireSimpleTrigger knows about an event. */
export interface LiveTriggerIds {
  clientId: string;
  estimateId?: string | null;
  ticketId?: string | null;
  invoiceId?: string | null;
  /** The job / visit / contract / damage case, for triggers about one of those. */
  recordId?: string | null;
}

/** Which of the event's ids is the trigger's own record. */
const LIVE_RECORD_ID: Record<ZapierCrmTriggerType, keyof LiveTriggerIds> = {
  client_created: "clientId",
  lead_created: "clientId",
  lead_converted_to_client: "clientId",
  client_cancelled: "clientId",
  estimate_created: "estimateId",
  estimate_won: "estimateId",
  estimate_lost: "estimateId",
  job_created: "recordId",
  ticket_created: "ticketId",
  ticket_closed: "ticketId",
  invoice_created: "invoiceId",
  invoice_paid: "invoiceId",
  contract_signed: "recordId",
  damage_case_created: "recordId",
  visit_dispatched: "recordId",
};

/** Tables whose rows carry client_id (everything here but clients itself and damage_cases). */
const CLIENT_SCOPED_TABLES = new Set(["estimates", "crm_jobs", "crm_tickets", "crm_invoices", "crm_contracts", "crm_job_visits"]);

/**
 * The record a live CRM event is about, mapped exactly as the polling
 * trigger maps it (so a REST-hook delivery matches the sample the Zap was
 * built from, id included). When the caller didn't know the record's own id
 * (some app paths fire job_created / visit_dispatched / contract_signed /
 * damage_case_created with only the client), falls back to that client's
 * newest matching record — the event has just happened, so it is the one.
 * Returns null when nothing can be found; the caller then sends the bare event.
 */
export async function loadLiveTriggerRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  triggerType: ZapierCrmTriggerType,
  ids: LiveTriggerIds
): Promise<Record<string, unknown> | null> {
  const config = POLLING_TRIGGERS[triggerType];
  const recordId = ids[LIVE_RECORD_ID[triggerType]];

  let query = db.from(config.table).select(config.columns).eq("org_id", orgId);
  if (config.hasSoftDelete) query = query.is("deleted_at", null);
  if (recordId) {
    query = query.eq("id", recordId);
  } else {
    for (const [column, value] of Object.entries(config.filters ?? {})) query = query.eq(column, value);
    for (const column of config.requireNotNull ?? []) query = query.not(column, "is", null);
    if (CLIENT_SCOPED_TABLES.has(config.table)) query = query.eq("client_id", ids.clientId);
    query = query.order(config.orderBy, { ascending: false });
  }
  const { data, error } = await query.limit(1);
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? config.map(row) : null;
}
