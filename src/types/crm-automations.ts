// ── Trigger & Condition types ─────────────────────────────────────────────────

export type TriggerType =
  | 'client_created'
  | 'client_status_changed'
  | 'job_completed'
  | 'job_created'
  | 'estimate_sent'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'contract_signed'
  | 'date_based'
  | 'manual';

export type ConditionField =
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
  | 'is_set'
  | 'is_not_set';

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
}

export interface NoteConfig {
  content: string;
}

export interface UpdateConfig {
  field: string;
  value: string;
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

export interface CRMSequenceTrigger {
  id: string;
  orgId: string;
  sequenceId: string;
  triggerType: TriggerType;
  position: number;
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
