import type { ConditionField, ConditionOperator } from "@/types/crm-automations";
import { PAYMENT_METHOD_OPTIONS } from "@/components/crm/ClientDetailPanel";

/**
 * Shared condition-field catalog used everywhere a sequence lets the user
 * build field/operator/value rows: If Branch, Stop Conditions, and Start
 * Trigger conditions. One list keeps all three in sync — previously If
 * Branch had its own hand-typed subset that quietly drifted from Stop
 * Conditions' list.
 */
export const CONDITION_GROUPS: { label: string; items: { value: ConditionField; label: string }[] }[] = [
  {
    label: "Client / Lead",
    items: [
      { value: "account_balance", label: "Account balance" },
      { value: "account_type", label: "Account type" },
      { value: "billing_term", label: "Billing term" },
      { value: "cancellation_reason", label: "Cancellation reason" },
      { value: "client_lead_status", label: "Client/Lead status" },
      { value: "client_since_date", label: "Client since date" },
      { value: "client_source", label: "Client source" },
      { value: "custom_field", label: "Custom field" },
      { value: "does_not_have_ach", label: "Does not have ACH on file" },
      { value: "does_not_have_credit_card", label: "Does not have credit card on file" },
      { value: "has_ach", label: "Has ACH on file" },
      { value: "has_credit_card", label: "Has credit card on file" },
      { value: "is_opted_in_emails", label: "Is opted in for emails" },
      { value: "map_code", label: "Map code" },
      { value: "opt_in_texts", label: "Opt-in texts" },
      { value: "payment_method_type", label: "Payment method type" },
      { value: "sales_person", label: "Sales person" },
      { value: "service_zip_code", label: "Service zip code" },
    ],
  },
  {
    label: "Date",
    items: [{ value: "date_of_year_between", label: "Date of year between" }],
  },
  {
    label: "Estimate",
    items: [
      { value: "estimate_has_product", label: "Estimate has product" },
      { value: "estimate_has_service", label: "Estimate has service" },
      { value: "estimate_sales_rep", label: "Estimate sales rep" },
      { value: "estimate_stage", label: "Estimate stage" },
      { value: "estimate_status", label: "Estimate status" },
      { value: "estimate_total", label: "Estimate total" },
    ],
  },
  {
    label: "Form",
    items: [{ value: "has_completed_form", label: "Has completed form" }],
  },
  {
    label: "Invoice",
    items: [
      { value: "invoice_has_product", label: "Invoice has product" },
      { value: "invoice_has_service", label: "Invoice has service" },
      { value: "invoice_past_due_days", label: "Invoice past due (days)" },
      { value: "invoice_was_paid_days", label: "Invoice was paid (days)" },
    ],
  },
  {
    label: "Job",
    items: [
      { value: "client_currently_has_package", label: "Client currently has package scheduled" },
      { value: "client_currently_has_recurring_job", label: "Client currently has recurring job" },
      { value: "client_does_not_have_package", label: "Client does not have package scheduled" },
      { value: "client_does_not_have_recurring_job", label: "Client does not have recurring job" },
      { value: "client_has_ever_had_package", label: "Client has ever had package" },
      { value: "client_has_ever_had_recurring_job", label: "Client has ever had recurring job" },
      { value: "client_has_not_ever_had_package", label: "Client has not ever had package" },
      { value: "client_has_not_ever_had_recurring_job", label: "Client has not ever had recurring job" },
      { value: "last_visit_date", label: "Last visit date" },
      { value: "visit_requires_call_ahead", label: "Visit requires call ahead" },
      { value: "scheduled_service", label: "Has job scheduled with service" },
      { value: "completed_service", label: "Has completed job with service" },
    ],
  },
  {
    label: "Tag",
    items: [
      { value: "does_not_have_tag", label: "Does not have tag" },
      { value: "has_tag", label: "Has tag" },
    ],
  },
  {
    label: "Ticket",
    items: [
      { value: "ticket_category", label: "Ticket category" },
      { value: "ticket_past_due_days", label: "Ticket past due (days)" },
    ],
  },
];

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "greater_than_or_equal", label: "greater than or equal to" },
  { value: "less_than_or_equal", label: "less than or equal to" },
  { value: "before", label: "before" },
  { value: "after", label: "after" },
  { value: "within_days", label: "within (days)" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

/** Fields whose value is a tag name — rendered as a Select of org-defined tags instead of free text. */
export const TAG_CONDITION_FIELDS = new Set<ConditionField>(["has_tag", "does_not_have_tag"]);

/** Fields whose value is a service name — rendered as a Select of active crm_services instead of free text. */
export const SERVICE_CONDITION_FIELDS = new Set<ConditionField>([
  "scheduled_service",
  "completed_service",
  "estimate_has_service",
  "invoice_has_service",
]);

/** Fields whose value is a product — rendered as a multi-select of product_items instead of free text. */
export const PRODUCT_CONDITION_FIELDS = new Set<ConditionField>(["estimate_has_product", "invoice_has_product"]);

/** Fields whose value is an org-configured ticket category — rendered as a multi-select of crm_list_options("ticket_categories"). */
export const TICKET_CATEGORY_CONDITION_FIELDS = new Set<ConditionField>(["ticket_category"]);

/** Fields whose value is a form — rendered as a multi-select of crm_forms instead of free text. */
export const FORM_CONDITION_FIELDS = new Set<ConditionField>(["has_completed_form"]);

/** Fields with a fixed, small value set — rendered as a multi-select of the options below instead of free text or an org list. */
export const FIXED_MULTI_CONDITION_FIELDS: Partial<Record<ConditionField, { value: string; label: string }[]>> = {
  account_type: [
    { value: "residential", label: "Residential" },
    { value: "commercial", label: "Commercial" },
  ],
  payment_method_type: PAYMENT_METHOD_OPTIONS,
  estimate_status: [
    { value: "not_required", label: "Not Required" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ],
};

/** Fields whose value is a sales rep — rendered as a multi-select of selectable sales-rep employees instead of free text. */
export const EMPLOYEE_CONDITION_FIELDS = new Set<ConditionField>(["sales_person", "estimate_sales_rep"]);

/**
 * Fields that are a plain boolean assertion — no value input needed,
 * selecting the field is the whole condition (operator is ignored). "On
 * file" here means the client's configured payment method looks like an ACH
 * or credit-card option, not a verified Stripe check.
 */
export const BOOLEAN_CONDITION_FIELDS = new Set<ConditionField>([
  "has_ach",
  "does_not_have_ach",
  "has_credit_card",
  "does_not_have_credit_card",
  "is_opted_in_emails",
  "client_currently_has_package",
  "client_does_not_have_package",
  "client_currently_has_recurring_job",
  "client_does_not_have_recurring_job",
  "client_has_ever_had_package",
  "client_has_not_ever_had_package",
  "client_has_ever_had_recurring_job",
  "client_has_not_ever_had_recurring_job",
  "visit_requires_call_ahead",
]);
