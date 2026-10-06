import type {
  POStatus,
  ApprovalStatus,
  WorkOrderStatus,
  WorkOrderPriority,
  ProductCategory,
  ProjectStatus,
  MaintenanceRequestStatus,
} from "@/types";

// ─── Purchase Order Status ───────────────────────────────────────────────────

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  requested: "Requested",
  pending: "Pending",
  approved: "Approved",
  ordered: "Ordered",
  canceled: "Canceled",
  completed: "Completed",
  rejected: "Rejected",
  partially_fulfilled: "Partially Fulfilled",
};

export const PO_STATUS_COLORS: Record<POStatus, string> = {
  requested: "bg-muted text-slate-700 dark:text-neutral-300 border-border",
  pending: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  approved: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  ordered: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  canceled: "bg-slate-200 dark:bg-neutral-700 text-muted-foreground border-slate-300 dark:border-neutral-700",
  completed: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800",
  partially_fulfilled: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800",
};

// ─── Approval Status ─────────────────────────────────────────────────────────

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  closed: "Closed",
};

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  draft: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  pending_approval: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  approved: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800",
  ordered: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  closed: "bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-400 border-slate-300 dark:border-neutral-700",
};

// ─── Work Order Status ────────────────────────────────────────────────────────

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Open",
  on_hold: "On Hold",
  in_progress: "In Progress",
  done: "Done",
  skipped: "Skipped",
};

export const WO_STATUS_COLORS: Record<WorkOrderStatus, string> = {
  open: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  on_hold: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  in_progress: "bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300 border-brand-200 dark:border-brand-800",
  done: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  skipped: "bg-muted text-muted-foreground border-border",
};

// ─── Work Order Priority ──────────────────────────────────────────────────────

export const WO_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const WO_PRIORITY_COLORS: Record<WorkOrderPriority, string> = {
  low: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  medium: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  high: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  critical: "bg-red-200 dark:bg-red-800/50 text-red-900 dark:text-red-200 border-red-300 dark:border-red-700",
};

// ─── Product Category ─────────────────────────────────────────────────────────

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  maintenance_part: "Maintenance Part",
  stocked_material: "Stocked Material",
  project_material: "Project Material",
};

export const PRODUCT_CATEGORY_COLORS: Record<ProductCategory, string> = {
  maintenance_part: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  stocked_material: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800",
  project_material: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
};

// ─── Project Status ───────────────────────────────────────────────────────────

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  sold: "Sold",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
  on_hold: "On Hold",
  canceled: "Canceled",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  sold: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  scheduled: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  in_progress: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  complete: "bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  on_hold: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  canceled: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
};

// ─── Asset Status ─────────────────────────────────────────────────────────────

export const ASSET_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  in_shop: "In Shop",
  out_of_service: "Out of Service",
  disposed: "Disposed",
};

export const ASSET_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  inactive: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  in_shop: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  out_of_service: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  disposed: "bg-slate-200 dark:bg-neutral-700 text-muted-foreground border-slate-300 dark:border-neutral-700",
};

// ─── Maintenance Request Status ───────────────────────────────────────────────

export const REQUEST_STATUS_LABELS: Record<MaintenanceRequestStatus, string> = {
  open: "Open",
  in_review: "In Review",
  approved: "Approved",
  converted: "Converted to WO",
  rejected: "Rejected",
};

export const REQUEST_STATUS_COLORS: Record<MaintenanceRequestStatus, string> = {
  open: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  in_review: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  approved: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  converted: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
};

// ─── PM Frequency ─────────────────────────────────────────────────────────────

export const PM_FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

// ─── Approval Flow Steps ──────────────────────────────────────────────────────

export const APPROVAL_FLOW_STEPS: Array<{
  label: string;
  statuses: ApprovalStatus[];
}> = [
  { label: "Draft", statuses: ["draft"] },
  { label: "Pending Approval", statuses: ["pending_approval"] },
  { label: "Approved", statuses: ["approved", "rejected"] },
  { label: "Ordered / Closed", statuses: ["ordered", "closed"] },
];

// ─── Damage Cases ─────────────────────────────────────────────────────────────

export const DAMAGE_CASE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const DAMAGE_CASE_TYPE_LABELS: Record<string, string> = {
  damage: "Damage",
  warranty: "Warranty",
};

// ─── Billing / Payment Terms ──────────────────────────────────────────────────

export const BILLING_TERMS_OPTIONS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_10", label: "Net 10" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

// ─── Injury Cases ─────────────────────────────────────────────────────────────

export const INJURY_CASE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const INJURY_SEVERITY_LABELS: Record<string, string> = {
  first_aid: "First Aid",
  medical_treatment: "Medical Treatment",
  lost_time: "Lost Time",
  fatality: "Fatality",
};

export const INJURY_INCIDENT_TYPE_COLORS: Record<string, string> = {
  injury: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
  illness: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
  near_miss: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300",
};

export const INJURY_INCIDENT_TYPE_LABELS: Record<string, string> = {
  injury: "Injury",
  illness: "Illness",
  near_miss: "Near miss",
};

export const INJURY_CLAIM_ROUTE_LABELS: Record<string, string> = {
  workers_comp: "Workers' comp",
  self_pay: "Self-pay (company)",
};

export const INJURY_EXPENSE_TYPE_LABELS: Record<string, string> = {
  medical: "Medical",
  lost_wages: "Lost wages",
  other: "Other",
};

export const INJURY_TYPE_OPTIONS = [
  "Abrasion / scrape",
  "Amputation",
  "Broken bone",
  "Bruise",
  "Burn (heat)",
  "Burn (chemical)",
  "Concussion (to the head)",
  "Crushing injury",
  "Cut / laceration / puncture",
  "Hernia",
  "Sprain / strain",
  "Heat illness",
  "Insect / animal bite",
  "Eye injury",
  "Damage to a body system",
  "Other",
];
