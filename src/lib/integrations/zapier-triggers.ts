import type { ZapierTriggerType } from "@/lib/integrations/zapier";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: (row: any) => Record<string, unknown>;
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
    hasSoftDelete: true,
    orderBy: "updated_at",
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
    map: (c) => ({
      id: c.id, displayName: c.display_name, cancellationReason: c.cancellation_reason,
      closedAt: c.closed_at, updatedAt: c.updated_at,
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
    columns: "id, estimate_number, client_id, description, estimate_date, updated_at",
    filters: { stage: "won" },
    hasSoftDelete: true,
    orderBy: "updated_at",
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
    columns: "id, invoice_number, client_id, invoice_date, due_date, status, amount_paid_cents, balance_cents, created_at",
    filters: { status: "paid" },
    hasSoftDelete: true,
    orderBy: "invoice_date",
    map: (i) => ({
      id: i.id, invoiceNumber: i.invoice_number, clientId: i.client_id, invoiceDate: i.invoice_date,
      dueDate: i.due_date, status: i.status, amountPaidCents: i.amount_paid_cents,
      balanceCents: i.balance_cents, createdAt: i.created_at,
    }),
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
};
