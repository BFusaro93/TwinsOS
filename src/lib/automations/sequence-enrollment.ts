import type { ConditionField, ConditionOperator, TriggerConfig, TriggerType } from "@/types/crm-automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Whether a client/estimate pair may be (re-)enrolled into a sequence, given
 * the sequence's allow_reentry/reentry_after_minutes settings. Looks at the
 * most recent enrollment row (any status) for this sequence, matched by
 * estimate_id when the trigger is estimate-based, or by client_id for
 * client-based triggers (e.g. a completed service visit) that have no
 * estimate at all:
 *  - no prior enrollment            → eligible
 *  - prior enrollment still running → not eligible (already in progress)
 *  - prior enrollment finished      → eligible only if allow_reentry is true
 *                                      AND reentry_after_minutes has elapsed
 *                                      since it finished
 */
export async function isEligibleForEnrollment(
  supabase: AnyClient,
  params: {
    sequenceId: string;
    clientId: string;
    estimateId: string | null;
    ticketId?: string | null;
    invoiceId?: string | null;
    allowReentry: boolean;
    reentryAfterMinutes: number;
  }
): Promise<boolean> {
  let query = supabase
    .from("crm_sequence_enrollments")
    .select("completed_at, stopped_at")
    .eq("sequence_id", params.sequenceId)
    .is("deleted_at", null)
    .order("enrolled_at", { ascending: false })
    .limit(1);

  // Dedup against the most specific record this trigger is scoped to — an
  // estimate/ticket/invoice-scoped trigger re-checks against that same
  // record's own enrollment history, not the client's enrollments in general
  // (mirrors the pre-existing estimate_id behavior).
  if (params.estimateId) {
    query = query.eq("estimate_id", params.estimateId);
  } else if (params.ticketId) {
    query = query.eq("ticket_id", params.ticketId);
  } else if (params.invoiceId) {
    query = query.eq("invoice_id", params.invoiceId);
  } else {
    query = query.eq("client_id", params.clientId).is("estimate_id", null).is("ticket_id", null).is("invoice_id", null);
  }

  const { data: existing } = await query.maybeSingle();

  if (!existing) return true;

  const finishedAt = existing.completed_at ?? existing.stopped_at;
  if (!finishedAt) return false; // still enrolled/in progress

  if (!params.allowReentry) return false;

  const elapsedMinutes = (Date.now() - new Date(finishedAt).getTime()) / 60_000;
  return elapsedMinutes >= params.reentryAfterMinutes;
}

/**
 * Appends one row to the automation execution audit log — the persisted
 * answer to "what did this automation actually do" (enrollments, sends,
 * skips, stop/complete, approval decisions). Best-effort: a logging failure
 * must never break the automation action it's describing.
 */
export async function logSequenceExecution(
  supabase: AnyClient,
  params: {
    orgId: string;
    action: string;
    enrollmentId?: string | null;
    sequenceId?: string | null;
    clientId?: string | null;
    eventId?: string | null;
    eventType?: string | null;
    detail?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from("crm_sequence_execution_log").insert({
      org_id: params.orgId,
      enrollment_id: params.enrollmentId ?? null,
      sequence_id: params.sequenceId ?? null,
      client_id: params.clientId ?? null,
      event_id: params.eventId ?? null,
      event_type: params.eventType ?? null,
      action: params.action,
      detail: params.detail ?? null,
    });
  } catch (err) {
    console.error("[sequence-execution-log] failed to log:", err);
  }
}

/** Enrolls a client into a sequence (after isEligibleForEnrollment has already been checked), computing next_fire_at from the sequence's first event. Returns the new enrollment's id, or null if the insert failed. */
export async function enrollClientInSequence(
  supabase: AnyClient,
  params: {
    sequenceId: string;
    orgId: string;
    clientId: string;
    estimateId?: string | null;
    ticketId?: string | null;
    invoiceId?: string | null;
  }
): Promise<string | null> {
  const { data: firstEvent } = await supabase
    .from("crm_sequence_events")
    .select("event_type, config")
    .eq("sequence_id", params.sequenceId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  let nextFireAt = new Date().toISOString();
  if (firstEvent?.event_type === "wait") {
    const cfg = firstEvent.config as Record<string, number> | null;
    const days = cfg?.days ?? 0;
    const hours = cfg?.hours ?? 0;
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(d.getHours() + hours);
    nextFireAt = d.toISOString();
  }

  const { data: inserted, error } = await supabase
    .from("crm_sequence_enrollments")
    .insert({
      org_id: params.orgId,
      sequence_id: params.sequenceId,
      client_id: params.clientId,
      estimate_id: params.estimateId ?? null,
      ticket_id: params.ticketId ?? null,
      invoice_id: params.invoiceId ?? null,
      enrolled_at: new Date().toISOString(),
      next_event_position: firstEvent?.event_type === "wait" ? 1 : 0,
      next_fire_at: nextFireAt,
    })
    .select("id")
    .single();

  if (error || !inserted) return null;

  await logSequenceExecution(supabase, {
    orgId: params.orgId,
    enrollmentId: inserted.id,
    sequenceId: params.sequenceId,
    clientId: params.clientId,
    action: "enrolled",
  });
  return inserted.id;
}

interface ConditionRow {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | null;
}

// Fields with a direct, unambiguous DB column to check against today. Fields
// left out (custom_field — schemaless) have no backing lookup wired up yet;
// conditions on those fields are evaluated as "not met" rather than
// throwing, so an unsupported condition just never matches.
const CLIENT_FIELD_GETTERS: Partial<Record<ConditionField, (client: Record<string, unknown>) => unknown>> = {
  account_type: (c) => c.account_type,
  map_code: (c) => c.map_code,
  account_balance: (c) => (typeof c.balance_outstanding_cents === "number" ? c.balance_outstanding_cents / 100 : null),
  service_zip_code: (c) => c.service_zip,
  client_since_date: (c) => c.client_since,
};

// Fields evaluated with custom logic (multi-select "any of" or boolean
// assertion) rather than the generic getter + compare() path — these still
// need the same `clients` row fetched, so they count toward needsClient.
const SPECIAL_CLIENT_CONDITION_FIELDS = new Set<ConditionField>([
  "payment_method_type",
  "sales_person",
  "has_ach",
  "does_not_have_ach",
  "has_credit_card",
  "does_not_have_credit_card",
  "is_opted_in_emails",
  "client_lead_status",
  "client_source",
  "billing_term",
  "cancellation_reason",
]);

// Fields resolved from a client's crm_jobs/crm_job_visits history rather
// than a column on `clients` itself — see getClientJobFacts().
const JOB_FACT_CONDITION_FIELDS = new Set<ConditionField>([
  "client_currently_has_package",
  "client_does_not_have_package",
  "client_currently_has_recurring_job",
  "client_does_not_have_recurring_job",
  "client_has_ever_had_package",
  "client_has_not_ever_had_package",
  "client_has_ever_had_recurring_job",
  "client_has_not_ever_had_recurring_job",
  "visit_requires_call_ahead",
  "last_visit_date",
]);

const ESTIMATE_FIELD_GETTERS: Partial<Record<ConditionField, (estimate: Record<string, unknown>) => unknown>> = {
  estimate_total: (e) => (typeof e.total_cents === "number" ? e.total_cents / 100 : null),
};

// Multi-select "any of" fields needing the same `estimates` row fetched.
const SPECIAL_ESTIMATE_CONDITION_FIELDS = new Set<ConditionField>(["estimate_sales_rep", "estimate_status", "estimate_stage"]);

const TICKET_FIELD_GETTERS: Partial<Record<ConditionField, (ticket: Record<string, unknown>) => unknown>> = {
  ticket_past_due_days: (t) => (t.due_date ? (Date.now() - new Date(String(t.due_date)).getTime()) / 86400000 : null),
};
const SPECIAL_TICKET_CONDITION_FIELDS = new Set<ConditionField>(["ticket_category"]);

const INVOICE_FIELD_GETTERS: Partial<Record<ConditionField, (invoice: Record<string, unknown>) => unknown>> = {
  invoice_past_due_days: (i) => (i.due_date ? (Date.now() - new Date(String(i.due_date)).getTime()) / 86400000 : null),
  // last_payment_date isn't a real crm_invoices column — it's merged onto
  // this object from a separate crm_payments query below.
  invoice_was_paid_days: (i) => (i.last_payment_date ? (Date.now() - new Date(String(i.last_payment_date)).getTime()) / 86400000 : null),
};

const TERMINAL_VISIT_STATUSES = new Set(["completed", "cancelled", "skipped"]);
const CURRENT_JOB_STATUSES = new Set(["scheduled", "in_progress", "hold"]);

/**
 * A client's package/recurring-job standing and call-ahead requirement,
 * derived from their non-deleted crm_jobs, plus the date of their last
 * completed visit — backs the Job-group condition fields that ask "is this
 * client currently on / have they ever been on a package or recurring job."
 */
async function getClientJobFacts(supabase: AnyClient, clientId: string) {
  const { data: jobs } = await supabase
    .from("crm_jobs")
    .select("job_type, status, call_ahead, package_id")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  const rows = (jobs ?? []) as { job_type: string; status: string; call_ahead: boolean | null; package_id: string | null }[];

  const { data: lastVisit } = await supabase
    .from("crm_job_visits")
    .select("scheduled_date")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const packageRows = rows.filter((j) => j.job_type === "package" && j.package_id);
  return {
    // "which specific package(s)" — client_currently/ever_had_package pick
    // from the org's crm_packages catalog rather than asserting "any package".
    currentPackageIds: new Set(packageRows.filter((j) => CURRENT_JOB_STATUSES.has(j.status)).map((j) => j.package_id!.toLowerCase())),
    everPackageIds: new Set(packageRows.map((j) => j.package_id!.toLowerCase())),
    currentRecurring: rows.some((j) => j.job_type === "recurring" && CURRENT_JOB_STATUSES.has(j.status)),
    everRecurring: rows.some((j) => j.job_type === "recurring"),
    requiresCallAhead: rows.some((j) => CURRENT_JOB_STATUSES.has(j.status) && j.call_ahead === true),
    lastVisitDate: (lastVisit as { scheduled_date: string } | null)?.scheduled_date ?? null,
  };
}

/** Service names (lowercased) a client currently has scheduled / has ever completed, mirroring useClientServiceHistory()'s per-visit → per-service-line resolution. */
async function getClientServiceSets(
  supabase: AnyClient,
  clientId: string
): Promise<{ scheduled: Set<string>; completed: Set<string> }> {
  const { data: visits } = await supabase
    .from("crm_job_visits")
    .select("job_id, status, job_service_id")
    .eq("client_id", clientId)
    .is("deleted_at", null);

  const visitRows = (visits ?? []) as { job_id: string; status: string; job_service_id: string | null }[];
  const scheduled = new Set<string>();
  const completed = new Set<string>();
  if (visitRows.length === 0) return { scheduled, completed };

  const jobIds = Array.from(new Set(visitRows.map((v) => v.job_id)));
  const { data: jobServices } = await supabase
    .from("crm_job_services")
    .select("id, job_id, service_name")
    .in("job_id", jobIds);

  const serviceRows = (jobServices ?? []) as { id: string; job_id: string; service_name: string }[];
  const nameById = new Map(serviceRows.map((s) => [s.id, s.service_name.toLowerCase()]));
  const namesByJobId = new Map<string, string[]>();
  serviceRows.forEach((s) => {
    namesByJobId.set(s.job_id, [...(namesByJobId.get(s.job_id) ?? []), s.service_name.toLowerCase()]);
  });

  visitRows.forEach((v) => {
    const names = v.job_service_id && nameById.has(v.job_service_id)
      ? [nameById.get(v.job_service_id)!]
      : namesByJobId.get(v.job_id) ?? [];
    if (v.status === "completed") names.forEach((n) => completed.add(n));
    else if (!TERMINAL_VISIT_STATUSES.has(v.status)) names.forEach((n) => scheduled.add(n));
  });

  return { scheduled, completed };
}

function compare(fieldValue: unknown, operator: ConditionOperator, condValue: string): boolean {
  if (operator === "is_set") return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
  if (operator === "is_not_set") return fieldValue === null || fieldValue === undefined || fieldValue === "";
  if (fieldValue === null || fieldValue === undefined) return false;

  if (operator === "before" || operator === "after" || operator === "within_days") {
    const fieldDate = new Date(String(fieldValue));
    if (Number.isNaN(fieldDate.getTime())) return false;
    if (operator === "within_days") {
      const days = Number(condValue);
      return Number.isFinite(days) && Math.abs(Date.now() - fieldDate.getTime()) <= days * 86400000;
    }
    const condDate = new Date(condValue);
    if (Number.isNaN(condDate.getTime())) return false;
    return operator === "before" ? fieldDate.getTime() < condDate.getTime() : fieldDate.getTime() > condDate.getTime();
  }

  const fv = String(fieldValue).toLowerCase();
  const cv = condValue.toLowerCase();

  switch (operator) {
    case "equals": return fv === cv;
    case "not_equals": return fv !== cv;
    case "contains": return fv.includes(cv);
    case "not_contains": return !fv.includes(cv);
    case "greater_than": return Number(fieldValue) > Number(condValue);
    case "less_than": return Number(fieldValue) < Number(condValue);
    case "greater_than_or_equal": return Number(fieldValue) >= Number(condValue);
    case "less_than_or_equal": return Number(fieldValue) <= Number(condValue);
    default: return false;
  }
}

/**
 * Evaluates a set of conditions against a client/estimate with either AND
 * (every row must match — If Branch, Start Trigger conditions) or OR (any
 * row matches — Stop Conditions) semantics. An empty condition list is
 * vacuously true under AND (no gate configured) and vacuously false under OR
 * (nothing configured to stop on).
 */
export async function evaluateConditionSet(
  supabase: AnyClient,
  conditions: ConditionRow[],
  join: "AND" | "OR",
  clientId: string | null,
  estimateId: string | null,
  ticketId: string | null = null,
  invoiceId: string | null = null
): Promise<boolean> {
  if (conditions.length === 0) return join === "AND";

  const needsClient = conditions.some((c) => c.field in CLIENT_FIELD_GETTERS || SPECIAL_CLIENT_CONDITION_FIELDS.has(c.field));
  const needsEstimate = conditions.some((c) => c.field in ESTIMATE_FIELD_GETTERS || SPECIAL_ESTIMATE_CONDITION_FIELDS.has(c.field));
  const needsEstimateServices = conditions.some((c) => c.field === "estimate_has_service");
  const needsEstimateProducts = conditions.some((c) => c.field === "estimate_has_product");
  const needsTicket = conditions.some((c) => c.field in TICKET_FIELD_GETTERS || SPECIAL_TICKET_CONDITION_FIELDS.has(c.field));
  const needsInvoice = conditions.some((c) => c.field in INVOICE_FIELD_GETTERS || c.field === "invoice_has_product" || c.field === "invoice_has_service");
  const needsInvoicePayments = conditions.some((c) => c.field === "invoice_was_paid_days");
  const needsInvoiceLines = conditions.some((c) => c.field === "invoice_has_product" || c.field === "invoice_has_service");
  const needsTags = conditions.some((c) => c.field === "has_tag" || c.field === "does_not_have_tag");
  const needsServices = conditions.some((c) => c.field === "scheduled_service" || c.field === "completed_service");
  const needsJobFacts = conditions.some((c) => JOB_FACT_CONDITION_FIELDS.has(c.field));
  const needsForms = conditions.some((c) => c.field === "has_completed_form");

  const [
    client, estimate, tags, serviceSets, ticket, invoice,
    estimateServiceNames, estimateProductIds, invoiceServiceNames, invoiceProductIds,
    lastPaymentDate, jobFacts, completedFormIds,
  ] = await Promise.all([
    needsClient && clientId
      ? supabase.from("clients")
          .select("status, source, account_type, billing_terms, map_code, cancellation_reason, service_zip, client_since, balance_outstanding_cents, ok_to_email, payment_method, sales_rep_id")
          .eq("id", clientId).maybeSingle().then((r: { data: Record<string, unknown> | null }) => r.data)
      : Promise.resolve(null),
    needsEstimate && estimateId
      ? supabase.from("estimates").select("stage, total_cents, sales_rep_id, approval_status").eq("id", estimateId).maybeSingle().then((r: { data: Record<string, unknown> | null }) => r.data)
      : Promise.resolve(null),
    needsTags && clientId
      ? supabase.from("client_tags").select("tag").eq("client_id", clientId).then((r: { data: { tag: string }[] | null }) => (r.data ?? []).map((t) => t.tag.toLowerCase()))
      : Promise.resolve([] as string[]),
    needsServices && clientId
      ? getClientServiceSets(supabase, clientId)
      : Promise.resolve({ scheduled: new Set<string>(), completed: new Set<string>() }),
    needsTicket && ticketId
      ? supabase.from("crm_tickets").select("category, due_date").eq("id", ticketId).maybeSingle().then((r: { data: Record<string, unknown> | null }) => r.data)
      : Promise.resolve(null),
    needsInvoice && invoiceId
      ? supabase.from("crm_invoices").select("due_date").eq("id", invoiceId).maybeSingle().then((r: { data: Record<string, unknown> | null }) => r.data)
      : Promise.resolve(null),
    needsEstimateServices && estimateId
      ? supabase.from("estimate_line_items").select("service_name").eq("estimate_id", estimateId).is("deleted_at", null)
          .then((r: { data: { service_name: string | null }[] | null }) => new Set((r.data ?? []).map((l) => l.service_name?.toLowerCase()).filter((v): v is string => !!v)))
      : Promise.resolve(new Set<string>()),
    needsEstimateProducts && estimateId
      ? supabase.from("estimate_direct_costs").select("product_item_id").eq("estimate_id", estimateId)
          .then((r: { data: { product_item_id: string | null }[] | null }) => new Set((r.data ?? []).map((l) => l.product_item_id?.toLowerCase()).filter((v): v is string => !!v)))
      : Promise.resolve(new Set<string>()),
    needsInvoiceLines && invoiceId
      ? supabase.from("crm_invoice_line_items").select("name").eq("invoice_id", invoiceId)
          .then((r: { data: { name: string | null }[] | null }) => new Set((r.data ?? []).map((l) => l.name?.toLowerCase()).filter((v): v is string => !!v)))
      : Promise.resolve(new Set<string>()),
    needsInvoiceLines && invoiceId
      ? supabase.from("crm_invoice_line_items").select("product_id").eq("invoice_id", invoiceId)
          .then((r: { data: { product_id: string | null }[] | null }) => new Set((r.data ?? []).map((l) => l.product_id?.toLowerCase()).filter((v): v is string => !!v)))
      : Promise.resolve(new Set<string>()),
    needsInvoicePayments && invoiceId
      ? supabase.from("crm_payments").select("payment_date").eq("invoice_id", invoiceId).order("payment_date", { ascending: false }).limit(1).maybeSingle()
          .then((r: { data: { payment_date: string } | null }) => r.data?.payment_date ?? null)
      : Promise.resolve(null),
    needsJobFacts && clientId
      ? getClientJobFacts(supabase, clientId)
      : Promise.resolve(null),
    needsForms && clientId
      ? supabase.from("crm_form_responses").select("form_id").eq("related_client_id", clientId).is("deleted_at", null)
          .then((r: { data: { form_id: string }[] | null }) => new Set((r.data ?? []).map((f) => f.form_id.toLowerCase())))
      : Promise.resolve(new Set<string>()),
  ]);

  const invoiceWithPayment = invoice ? { ...invoice, last_payment_date: lastPaymentDate } : null;

  // These fields are rendered with the multi-select checkbox picker (see
  // TAG_CONDITION_FIELDS / SERVICE_CONDITION_FIELDS / etc. in
  // condition-fields.ts), so their value is a comma-separated list — "any
  // of" semantics.
  const csvValues = (v: string | null) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  const results = conditions.map((c) => {
    if (c.field === "has_tag") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => tags.includes(v)); }
    if (c.field === "does_not_have_tag") { const vs = csvValues(c.value); return vs.length > 0 && vs.every((v) => !tags.includes(v)); }
    if (c.field === "scheduled_service") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => serviceSets.scheduled.has(v)); }
    if (c.field === "completed_service") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => serviceSets.completed.has(v)); }
    if (c.field === "account_type") {
      const vs = csvValues(c.value);
      const clientAccountType = client?.account_type ? String(client.account_type).toLowerCase() : null;
      return vs.length > 0 && !!clientAccountType && vs.includes(clientAccountType);
    }
    if (c.field === "payment_method_type") {
      const vs = csvValues(c.value);
      const clientPaymentMethod = client?.payment_method ? String(client.payment_method).toLowerCase() : null;
      return vs.length > 0 && !!clientPaymentMethod && vs.includes(clientPaymentMethod);
    }
    if (c.field === "sales_person") {
      const vs = csvValues(c.value);
      const salesRepId = client?.sales_rep_id ? String(client.sales_rep_id).toLowerCase() : null;
      return vs.length > 0 && !!salesRepId && vs.includes(salesRepId);
    }
    if (c.field === "is_opted_in_emails") return client?.ok_to_email === true;
    if (c.field === "client_lead_status") {
      const vs = csvValues(c.value);
      const status = client?.status ? String(client.status).toLowerCase() : null;
      return vs.length > 0 && !!status && vs.includes(status);
    }
    if (c.field === "client_source") {
      const vs = csvValues(c.value);
      const source = client?.source ? String(client.source).toLowerCase() : null;
      return vs.length > 0 && !!source && vs.includes(source);
    }
    if (c.field === "billing_term") {
      const vs = csvValues(c.value);
      const term = client?.billing_terms ? String(client.billing_terms).toLowerCase() : null;
      return vs.length > 0 && !!term && vs.includes(term);
    }
    if (c.field === "cancellation_reason") {
      const vs = csvValues(c.value);
      const reason = client?.cancellation_reason ? String(client.cancellation_reason).toLowerCase() : null;
      return vs.length > 0 && !!reason && vs.includes(reason);
    }
    if (c.field === "has_ach" || c.field === "does_not_have_ach" || c.field === "has_credit_card" || c.field === "does_not_have_credit_card") {
      // clients.payment_method is free text from PAYMENT_METHOD_OPTIONS (see
      // ClientDetailPanel.tsx) — there's no real "on file" verification (e.g.
      // via Stripe), so these are a proxy off the client's configured method.
      const paymentMethod = client?.payment_method ? String(client.payment_method).toLowerCase() : "";
      const isAch = paymentMethod === "ach/e-check";
      const isCreditCard = paymentMethod.startsWith("credit card");
      if (c.field === "has_ach") return isAch;
      if (c.field === "does_not_have_ach") return !isAch;
      if (c.field === "has_credit_card") return isCreditCard;
      return !isCreditCard; // does_not_have_credit_card
    }

    if (c.field === "client_currently_has_package") {
      const vs = csvValues(c.value);
      return vs.length > 0 && !!jobFacts && vs.some((v) => jobFacts.currentPackageIds.has(v));
    }
    if (c.field === "client_does_not_have_package") {
      const vs = csvValues(c.value);
      return vs.length > 0 && !!jobFacts && vs.every((v) => !jobFacts.currentPackageIds.has(v));
    }
    if (c.field === "client_has_ever_had_package") {
      const vs = csvValues(c.value);
      return vs.length > 0 && !!jobFacts && vs.some((v) => jobFacts.everPackageIds.has(v));
    }
    if (c.field === "client_has_not_ever_had_package") {
      const vs = csvValues(c.value);
      return vs.length > 0 && !!jobFacts && vs.every((v) => !jobFacts.everPackageIds.has(v));
    }
    if (c.field === "client_currently_has_recurring_job") return !!jobFacts?.currentRecurring;
    if (c.field === "client_does_not_have_recurring_job") return !jobFacts?.currentRecurring;
    if (c.field === "client_has_ever_had_recurring_job") return !!jobFacts?.everRecurring;
    if (c.field === "client_has_not_ever_had_recurring_job") return !jobFacts?.everRecurring;
    if (c.field === "visit_requires_call_ahead") return !!jobFacts?.requiresCallAhead;
    if (c.field === "last_visit_date") return compare(jobFacts?.lastVisitDate ?? null, c.operator, c.value ?? "");

    if (c.field === "has_completed_form") {
      const vs = csvValues(c.value);
      return vs.length > 0 && vs.some((v) => completedFormIds.has(v));
    }

    if (c.field === "estimate_sales_rep") {
      const vs = csvValues(c.value);
      const repId = estimate?.sales_rep_id ? String(estimate.sales_rep_id).toLowerCase() : null;
      return vs.length > 0 && !!repId && vs.includes(repId);
    }
    if (c.field === "estimate_status") {
      const vs = csvValues(c.value);
      const status = estimate?.approval_status ? String(estimate.approval_status).toLowerCase() : null;
      return vs.length > 0 && !!status && vs.includes(status);
    }
    if (c.field === "estimate_stage") {
      const vs = csvValues(c.value);
      const stage = estimate?.stage ? String(estimate.stage).toLowerCase() : null;
      return vs.length > 0 && !!stage && vs.includes(stage);
    }
    if (c.field === "estimate_has_service") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => estimateServiceNames.has(v)); }
    if (c.field === "estimate_has_product") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => estimateProductIds.has(v)); }

    if (c.field === "ticket_category") {
      const vs = csvValues(c.value);
      const category = ticket?.category ? String(ticket.category).toLowerCase() : null;
      return vs.length > 0 && !!category && vs.includes(category);
    }
    if (c.field === "invoice_has_service") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => invoiceServiceNames.has(v)); }
    if (c.field === "invoice_has_product") { const vs = csvValues(c.value); return vs.length > 0 && vs.some((v) => invoiceProductIds.has(v)); }

    const clientGetter = CLIENT_FIELD_GETTERS[c.field];
    if (clientGetter) return !!client && compare(clientGetter(client), c.operator, c.value ?? "");

    const estimateGetter = ESTIMATE_FIELD_GETTERS[c.field];
    if (estimateGetter) return !!estimate && compare(estimateGetter(estimate), c.operator, c.value ?? "");

    const ticketGetter = TICKET_FIELD_GETTERS[c.field];
    if (ticketGetter) return !!ticket && compare(ticketGetter(ticket), c.operator, c.value ?? "");

    const invoiceGetter = INVOICE_FIELD_GETTERS[c.field];
    if (invoiceGetter) return !!invoiceWithPayment && compare(invoiceGetter(invoiceWithPayment), c.operator, c.value ?? "");

    return false; // unsupported field
  });

  return join === "AND" ? results.every(Boolean) : results.some(Boolean);
}

/**
 * True if ANY configured stop condition for the sequence is currently met
 * (matches the "stops when any condition is met" copy in the rules dialog).
 */
export async function shouldStopSequence(
  supabase: AnyClient,
  sequenceId: string,
  clientId: string | null,
  estimateId: string | null,
  ticketId: string | null = null,
  invoiceId: string | null = null
): Promise<boolean> {
  const { data: conditions } = await supabase
    .from("crm_sequence_stop_conditions")
    .select("field, operator, value")
    .eq("sequence_id", sequenceId);

  return evaluateConditionSet(supabase, (conditions ?? []) as ConditionRow[], "OR", clientId, estimateId, ticketId, invoiceId);
}

/**
 * True if ALL of a specific trigger's own gating conditions are met (or the
 * trigger has none configured). Every row shares condition_group 0 today —
 * the UI only offers one AND-group per trigger, matching If Branch's model —
 * so this ignores condition_group and just ANDs every row together.
 */
export async function triggerConditionsMet(
  supabase: AnyClient,
  triggerId: string,
  clientId: string | null,
  estimateId: string | null,
  ticketId: string | null = null,
  invoiceId: string | null = null
): Promise<boolean> {
  const { data: conditions } = await supabase
    .from("crm_sequence_trigger_conditions")
    .select("field, operator, value")
    .eq("trigger_id", triggerId);

  return evaluateConditionSet(supabase, (conditions ?? []) as ConditionRow[], "AND", clientId, estimateId, ticketId, invoiceId);
}

/**
 * Fires the 'service_visit_completed' trigger type for every active sequence
 * configured for one of the just-completed visit's services (or configured
 * for "any service"), enrolling the client if eligible. Called from the
 * visit-complete route right after a visit's status flips to 'completed'.
 */
export async function fireServiceVisitCompletedTriggers(
  supabase: AnyClient,
  params: { orgId: string; clientId: string; serviceIds: string[] }
): Promise<string[]> {
  if (params.serviceIds.length === 0) return [];

  const enrolledIds: string[] = [];

  const { data: triggers } = await supabase
    .from("crm_sequence_triggers")
    .select("id, sequence_id, config, crm_automation_sequences(is_active, allow_reentry, reentry_after_minutes, crm_automations(is_active, org_id))")
    .eq("trigger_type", "service_visit_completed");

  for (const trigger of (triggers ?? []) as {
    id: string;
    sequence_id: string;
    config: Record<string, unknown> | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    crm_automation_sequences: any;
  }[]) {
    const seq = trigger.crm_automation_sequences;
    const auto = seq?.crm_automations;
    if (!seq?.is_active || !auto?.is_active) continue;
    if (auto.org_id !== params.orgId) continue;

    const configServiceId = trigger.config?.service_id as string | undefined;
    if (configServiceId && !params.serviceIds.includes(configServiceId)) continue; // "any service" when unset

    const conditionsMet = await triggerConditionsMet(supabase, trigger.id, params.clientId, null);
    if (!conditionsMet) continue;

    const eligible = await isEligibleForEnrollment(supabase, {
      sequenceId: trigger.sequence_id,
      clientId: params.clientId,
      estimateId: null,
      allowReentry: seq.allow_reentry ?? false,
      reentryAfterMinutes: seq.reentry_after_minutes ?? 1440,
    });
    if (!eligible) continue;

    const enrollmentId = await enrollClientInSequence(supabase, {
      sequenceId: trigger.sequence_id,
      orgId: params.orgId,
      clientId: params.clientId,
    });
    if (enrollmentId) enrolledIds.push(enrollmentId);
  }

  return enrolledIds;
}

/**
 * Fires a trigger type that has no per-trigger config filtering of its own
 * (unlike service_visit_completed's service_id filter) — evaluates each
 * configured trigger's AND conditions and enrolls the client if eligible.
 * This is the generic path for the simple event triggers (tag added/removed,
 * client status changes, ticket/estimate/invoice events, etc.) — anything
 * that just needs "did this org configure a sequence for this event type."
 */
export async function fireSimpleTrigger(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string;
    estimateId?: string | null;
    /** The ticket/invoice this event pertains to — threaded through so ticket_category/ticket_past_due_days/invoice_* conditions can check the right record, and so the enrollment (and its later stop-condition checks) stay scoped to it. */
    ticketId?: string | null;
    invoiceId?: string | null;
    triggerType: TriggerType;
    /**
     * The value(s) this specific event pertains to (a visit's service ids, a
     * client's new source, a ticket's category) — checked against the
     * trigger's config.filter_values, if the builder configured one. Only
     * needed for trigger types that expose the inline multi-select picker;
     * triggers with no filter_values configured always match regardless of
     * whether this is passed.
     */
    matchValues?: string[];
  }
): Promise<string[]> {
  const enrolledIds: string[] = [];

  const { data: triggers } = await supabase
    .from("crm_sequence_triggers")
    .select("id, sequence_id, config, crm_automation_sequences(is_active, allow_reentry, reentry_after_minutes, crm_automations(is_active, org_id))")
    .eq("trigger_type", params.triggerType);

  for (const trigger of (triggers ?? []) as {
    id: string;
    sequence_id: string;
    config: TriggerConfig | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    crm_automation_sequences: any;
  }[]) {
    const seq = trigger.crm_automation_sequences;
    const auto = seq?.crm_automations;
    if (!seq?.is_active || !auto?.is_active) continue;
    if (auto.org_id !== params.orgId) continue;

    const filterValues = trigger.config?.filter_values;
    if (filterValues && filterValues.length > 0) {
      const allowed = new Set(filterValues.map((v) => v.toLowerCase()));
      const eventValues = (params.matchValues ?? []).map((v) => v.toLowerCase());
      if (!eventValues.some((v) => allowed.has(v))) continue;
    }

    const conditionsMet = await triggerConditionsMet(
      supabase, trigger.id, params.clientId, params.estimateId ?? null, params.ticketId ?? null, params.invoiceId ?? null
    );
    if (!conditionsMet) continue;

    const eligible = await isEligibleForEnrollment(supabase, {
      sequenceId: trigger.sequence_id,
      clientId: params.clientId,
      estimateId: params.estimateId ?? null,
      ticketId: params.ticketId ?? null,
      invoiceId: params.invoiceId ?? null,
      allowReentry: seq.allow_reentry ?? false,
      reentryAfterMinutes: seq.reentry_after_minutes ?? 1440,
    });
    if (!eligible) continue;

    const enrollmentId = await enrollClientInSequence(supabase, {
      sequenceId: trigger.sequence_id,
      orgId: params.orgId,
      clientId: params.clientId,
      estimateId: params.estimateId ?? null,
      ticketId: params.ticketId ?? null,
      invoiceId: params.invoiceId ?? null,
    });
    if (enrollmentId) enrolledIds.push(enrollmentId);
  }

  return enrolledIds;
}
