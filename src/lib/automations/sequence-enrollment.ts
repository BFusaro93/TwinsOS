import type { ConditionField, ConditionOperator } from "@/types/crm-automations";

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

  query = params.estimateId
    ? query.eq("estimate_id", params.estimateId)
    : query.eq("client_id", params.clientId).is("estimate_id", null);

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

/** Enrolls a client into a sequence (after isEligibleForEnrollment has already been checked), computing next_fire_at from the sequence's first event. Returns false if the insert failed. */
export async function enrollClientInSequence(
  supabase: AnyClient,
  params: {
    sequenceId: string;
    orgId: string;
    clientId: string;
    estimateId?: string | null;
  }
): Promise<boolean> {
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
    const days = (firstEvent.config as Record<string, number> | null)?.days ?? 0;
    const d = new Date();
    d.setDate(d.getDate() + days);
    nextFireAt = d.toISOString();
  }

  const { data: inserted, error } = await supabase
    .from("crm_sequence_enrollments")
    .insert({
      org_id: params.orgId,
      sequence_id: params.sequenceId,
      client_id: params.clientId,
      estimate_id: params.estimateId ?? null,
      enrolled_at: new Date().toISOString(),
      next_event_position: firstEvent?.event_type === "wait" ? 1 : 0,
      next_fire_at: nextFireAt,
    })
    .select("id")
    .single();

  if (error || !inserted) return false;

  await logSequenceExecution(supabase, {
    orgId: params.orgId,
    enrollmentId: inserted.id,
    sequenceId: params.sequenceId,
    clientId: params.clientId,
    action: "enrolled",
  });
  return true;
}

interface ConditionRow {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | null;
}

// Fields with a direct, unambiguous DB column to check against today. Fields
// left out (sales_person — relational, custom_field — schemaless, date
// comparisons, invoice/ticket conditions) have no backing lookup wired up
// yet; conditions on those fields are evaluated as "not met" rather than
// throwing, so an unsupported condition just never matches.
const CLIENT_FIELD_GETTERS: Partial<Record<ConditionField, (client: Record<string, unknown>) => unknown>> = {
  client_lead_status: (c) => c.status,
  client_source: (c) => c.source,
  account_type: (c) => c.account_type,
  billing_term: (c) => c.billing_terms,
  map_code: (c) => c.map_code,
};

const ESTIMATE_FIELD_GETTERS: Partial<Record<ConditionField, (estimate: Record<string, unknown>) => unknown>> = {
  estimate_stage: (e) => e.stage,
  estimate_total: (e) => (typeof e.total_cents === "number" ? e.total_cents / 100 : null),
};

const TERMINAL_VISIT_STATUSES = new Set(["completed", "cancelled", "skipped"]);

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
    default: return false; // before/after/within_days need date-aware fields — none wired up yet
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
  estimateId: string | null
): Promise<boolean> {
  if (conditions.length === 0) return join === "AND";

  const needsClient = conditions.some((c) => c.field in CLIENT_FIELD_GETTERS);
  const needsEstimate = conditions.some((c) => c.field in ESTIMATE_FIELD_GETTERS);
  const needsTags = conditions.some((c) => c.field === "has_tag" || c.field === "does_not_have_tag");
  const needsServices = conditions.some((c) => c.field === "scheduled_service" || c.field === "completed_service");

  const [client, estimate, tags, serviceSets] = await Promise.all([
    needsClient && clientId
      ? supabase.from("clients").select("status, source, account_type, billing_terms, map_code").eq("id", clientId).maybeSingle().then((r: { data: Record<string, unknown> | null }) => r.data)
      : Promise.resolve(null),
    needsEstimate && estimateId
      ? supabase.from("estimates").select("stage, total_cents").eq("id", estimateId).maybeSingle().then((r: { data: Record<string, unknown> | null }) => r.data)
      : Promise.resolve(null),
    needsTags && clientId
      ? supabase.from("client_tags").select("tag").eq("client_id", clientId).then((r: { data: { tag: string }[] | null }) => (r.data ?? []).map((t) => t.tag.toLowerCase()))
      : Promise.resolve([] as string[]),
    needsServices && clientId
      ? getClientServiceSets(supabase, clientId)
      : Promise.resolve({ scheduled: new Set<string>(), completed: new Set<string>() }),
  ]);

  const results = conditions.map((c) => {
    if (c.field === "has_tag") return !!c.value && tags.includes(c.value.toLowerCase());
    if (c.field === "does_not_have_tag") return !!c.value && !tags.includes(c.value.toLowerCase());
    if (c.field === "scheduled_service") return !!c.value && serviceSets.scheduled.has(c.value.toLowerCase());
    if (c.field === "completed_service") return !!c.value && serviceSets.completed.has(c.value.toLowerCase());

    const clientGetter = CLIENT_FIELD_GETTERS[c.field];
    if (clientGetter) return !!client && compare(clientGetter(client), c.operator, c.value ?? "");

    const estimateGetter = ESTIMATE_FIELD_GETTERS[c.field];
    if (estimateGetter) return !!estimate && compare(estimateGetter(estimate), c.operator, c.value ?? "");

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
  estimateId: string | null
): Promise<boolean> {
  const { data: conditions } = await supabase
    .from("crm_sequence_stop_conditions")
    .select("field, operator, value")
    .eq("sequence_id", sequenceId);

  return evaluateConditionSet(supabase, (conditions ?? []) as ConditionRow[], "OR", clientId, estimateId);
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
  estimateId: string | null
): Promise<boolean> {
  const { data: conditions } = await supabase
    .from("crm_sequence_trigger_conditions")
    .select("field, operator, value")
    .eq("trigger_id", triggerId);

  return evaluateConditionSet(supabase, (conditions ?? []) as ConditionRow[], "AND", clientId, estimateId);
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
): Promise<void> {
  if (params.serviceIds.length === 0) return;

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

    await enrollClientInSequence(supabase, {
      sequenceId: trigger.sequence_id,
      orgId: params.orgId,
      clientId: params.clientId,
    });
  }
}
