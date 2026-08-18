// ── Trigger & Condition types ─────────────────────────────────────────────────

export type TriggerType =
  // Client / Lead
  | 'client_cancelled'
  | 'client_source_updated'
  | 'client_created'
  | 'client_reactivated'
  | 'client_referred'
  | 'credit_card_charge_failed'
  | 'credit_card_about_to_expire'
  | 'credit_card_updated'
  | 'has_opted_in_emails'
  | 'has_opted_in_sms'
  | 'lead_cancelled'
  | 'lead_converted_to_client'
  | 'lead_created'
  | 'payment_method_updated'
  // Contract
  | 'contract_about_to_expire'
  | 'contract_created'
  | 'contract_signed'
  // Damage Case
  | 'damage_case_created'
  // Estimate
  | 'estimate_created'
  | 'estimate_lost'
  | 'estimate_sent'
  | 'estimate_won'
  | 'estimate_expiring'
  | 'estimate_no_response'
  // Form
  | 'form_submitted'
  // Invoice
  | 'invoice_past_due'
  | 'invoice_created'
  | 'invoice_paid'
  | 'invoice_sent'
  // Job
  | 'job_cancelled'
  | 'job_created'
  | 'package_created'
  | 'visit_date_changed'
  | 'visit_moved_to_waiting_list'
  | 'visit_cancelled'
  | 'visit_completed'
  | 'visit_dispatched'
  | 'visit_skipped'
  // Tag
  | 'tag_added'
  | 'tag_removed'
  // Job (service-specific)
  | 'service_visit_completed'
  // Ticket
  | 'ticket_past_due'
  | 'ticket_closed'
  | 'ticket_created'
  | 'ticket_reopened'
  // Legacy / keep for compatibility
  | 'client_status_changed'
  | 'date_based'
  | 'manual';

export type ConditionField =
  // Client / Lead
  | 'account_balance'
  | 'account_type'
  | 'billing_term'
  | 'cancellation_reason'
  | 'client_lead_status'
  | 'client_since_date'
  | 'client_source'
  | 'custom_field'
  | 'does_not_have_ach'
  | 'does_not_have_credit_card'
  | 'has_ach'
  | 'has_credit_card'
  | 'is_opted_in_emails'
  | 'map_code'
  | 'opt_in_texts'
  | 'payment_method_type'
  | 'sales_person'
  | 'service_zip_code'
  // Estimate
  | 'estimate_has_product'
  | 'estimate_has_service'
  | 'estimate_sales_rep'
  | 'estimate_stage'
  | 'estimate_status'
  | 'estimate_total'
  // Form
  | 'has_completed_form'
  // Invoice
  | 'invoice_has_product'
  | 'invoice_has_service'
  | 'invoice_past_due_days'
  | 'invoice_was_paid_days'
  // Job
  | 'client_currently_has_package'
  | 'client_currently_has_recurring_job'
  | 'client_does_not_have_package'
  | 'client_does_not_have_recurring_job'
  | 'client_has_ever_had_package'
  | 'client_has_ever_had_recurring_job'
  | 'client_has_not_ever_had_package'
  | 'client_has_not_ever_had_recurring_job'
  | 'last_visit_date'
  | 'visit_requires_call_ahead'
  | 'scheduled_service'
  | 'completed_service'
  // Tag
  | 'does_not_have_tag'
  | 'has_tag'
  // Ticket
  | 'ticket_category'
  | 'ticket_past_due_days'
  // Legacy
  | 'client_type'
  | 'client_status'
  | 'job_type'
  | 'job_status'
  | 'tag'
  | 'property_city'
  | 'revenue_ytd'
  | 'last_job_date';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_set'
  | 'is_not_set'
  | 'before'
  | 'after'
  | 'within_days';

// ── Event types ───────────────────────────────────────────────────────────────

export type EventType =
  | 'wait'
  | 'email'
  | 'alert'
  | 'text_message'
  | 'ticket'
  | 'if_branch'
  | 'note'
  | 'update'
  | 'tags';

export interface WaitConfig {
  days: number;
  hours: number;
  minutes: number;
}

export interface EmailConfig {
  name: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  category: string;
  between_start: string;
  between_end: string;
  send_weekdays_only: boolean;
  require_approval: boolean;
}

export interface AlertConfig {
  message: string;
  alert_type: 'info' | 'warning' | 'urgent';
  recipient_user_ids: string[];
}

export interface TicketConfig {
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assign_to: string;
}

export interface TextConfig {
  message: string;
  to: string[];
  require_approval: boolean;
}

export interface NoteConfig {
  content: string;
}

export interface UpdateConfig {
  field: string;
  value: string;
  /** Only set when field === 'custom_field' — which crm_custom_field_defs row to write. */
  customFieldId?: string;
}

export interface TagsConfig {
  add_tags: string[];
  remove_tags: string[];
}

export interface IfBranchCondition {
  field: string;
  operator: string;
  value: string;
}

export interface IfBranchConfig {
  conditions: IfBranchCondition[];
}

export type EventConfig =
  | { event_type: 'wait'; config: WaitConfig }
  | { event_type: 'email'; config: EmailConfig }
  | { event_type: 'alert'; config: AlertConfig }
  | { event_type: 'text_message'; config: TextConfig }
  | { event_type: 'ticket'; config: TicketConfig }
  | { event_type: 'if_branch'; config: IfBranchConfig }
  | { event_type: 'note'; config: NoteConfig }
  | { event_type: 'update'; config: UpdateConfig }
  | { event_type: 'tags'; config: TagsConfig };

// ── DB interfaces ─────────────────────────────────────────────────────────────

export interface CRMAutomation {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CRMSequence {
  id: string;
  orgId: string;
  automationId: string;
  name: string;
  description: string | null;
  restrictEntryTo: string;
  allowReentry: boolean;
  reentryAfterMinutes: number;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Config for trigger types that need extra parameters beyond their type. */
export interface TriggerConfig {
  /** date-gap trigger types (estimate_expiring, estimate_no_response). */
  days?: number;
  /** service_visit_completed — a crm_services.id to match, or unset for "any service". */
  service_id?: string;
  /**
   * Multi-value filter for trigger types with an enumerable "which of these"
   * dimension shown inline next to the trigger picker — service ids for
   * visit_completed, client_sources values for client_source_updated,
   * ticket_categories values for ticket_created/ticket_closed/ticket_reopened.
   * Empty/unset means "any" (no filtering), matching every other trigger.
   */
  filter_values?: string[];
}

export interface CRMSequenceTrigger {
  id: string;
  orgId: string;
  sequenceId: string;
  triggerType: TriggerType;
  position: number;
  /** Only meaningful for date-gap trigger types — e.g. { days: 7 }. */
  config: TriggerConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CRMTriggerCondition {
  id: string;
  orgId: string;
  triggerId: string;
  conditionGroup: number;
  field: ConditionField;
  operator: ConditionOperator;
  value: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CRMStopCondition {
  id: string;
  orgId: string;
  sequenceId: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CRMSequenceEvent {
  id: string;
  orgId: string;
  sequenceId: string;
  eventType: EventType;
  position: number;
  isActive: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Composed types ────────────────────────────────────────────────────────────

export type AutomationWithSequences = CRMAutomation & {
  sequences: CRMSequence[];
};

export type SequenceWithDetails = CRMSequence & {
  triggers: (CRMSequenceTrigger & { conditions: CRMTriggerCondition[] })[];
  stop_conditions: CRMStopCondition[];
  events: CRMSequenceEvent[];
};
