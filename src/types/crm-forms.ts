export type FormStatus = "draft" | "published";

export type FormFieldType =
  // simple fields
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "checkbox"
  | "date"
  | "number"
  // advanced fields
  | "multiple_choice"
  | "checklist"
  | "rating"
  | "review"
  | "hidden"
  | "sms_optin"
  // layout / display
  | "header"
  | "paragraph"
  | "divider"
  // widgets
  | "attachment";

export type FormResponseStatus = "on_hold" | "completed" | "spam" | "ignored";

export type AccountMatchingStrategy =
  | "email"
  | "name_and_email"
  | "name_email_and_company"
  | "custom";

export type AccountUpdateStrategy = "replace_all" | "add_new";

export type FormRuleOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "is_empty"
  | "is_not_empty";

export type FormRuleAction =
  | "jump_to_page"
  | "show_field"
  | "hide_field"
  | "add_tag"
  | "remove_tag";

// Config shapes stored in crm_form_fields.config (jsonb)
export interface RatingFieldConfig {
  min: number;  // always 0
  max: number;  // 5 or 10
  color?: string;
}

export interface ReviewFieldConfig {
  max: number;  // 1–5 stars
  color?: string;
}

export interface NumberFieldConfig {
  startingValue?: number;
}

// Mapping from our field to a client/contact field
// Format: '<entity>.<field>' e.g. 'client.first_name', 'client.email', 'contact.phone'
export type MappedField = string;

export interface CRMForm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: FormStatus;
  settings: Record<string, unknown>;
  // account management
  autoManageAccounts: boolean;
  accountMatchingStrategy: AccountMatchingStrategy;
  accountUpdateStrategy: AccountUpdateStrategy;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CRMFormField {
  id: string;
  formId: string;
  fieldType: FormFieldType;
  label: string;
  placeholder: string | null;
  description: string | null;   // helper text shown below the label
  required: boolean;
  sortOrder: number;
  pageNumber: number;           // 1-based page this field lives on
  mappedField: MappedField | null; // maps to a CRM field on submit
  options: string[] | null;     // for select / multiple_choice / checklist
  config: Record<string, unknown>; // type-specific config (rating scale, star count, etc.)
}

export interface CRMFormRule {
  id: string;
  formId: string;
  sourceFieldId: string | null; // null = fires on page navigation
  ruleType: "page" | "field";
  operator: FormRuleOperator;
  operand: string | null;
  action: FormRuleAction;
  actionValue: string | null;   // page number, field id, or tag id
  sortOrder: number;
  createdAt: string;
}

export interface CRMFormResponse {
  id: string;
  formId: string;
  formName: string;
  submittedByName: string | null;
  submittedByEmail: string | null;
  data: Record<string, unknown>;
  result: string | null;
  status: FormResponseStatus;
  relatedClientId: string | null;
  relatedTicketId: string | null;
  formLocation: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NewFormValues {
  name: string;
  description: string;
  status: FormStatus;
}
