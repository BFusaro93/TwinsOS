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
  requested: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  ordered: "bg-blue-100 text-blue-800 border-blue-200",
  canceled: "bg-slate-200 text-slate-500 border-slate-300",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  partially_fulfilled: "bg-orange-100 text-orange-800 border-orange-200",
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
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  pending_approval: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  ordered: "bg-blue-100 text-blue-800 border-blue-200",
  closed: "bg-slate-200 text-slate-600 border-slate-300",
};

// ─── Work Order Status ────────────────────────────────────────────────────────

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Open",
  on_hold: "On Hold",
  in_progress: "In Progress",
  done: "Done",
};

export const WO_STATUS_COLORS: Record<WorkOrderStatus, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  on_hold: "bg-yellow-100 text-yellow-700 border-yellow-200",
  in_progress: "bg-brand-100 text-brand-800 border-brand-200",
  done: "bg-green-100 text-green-800 border-green-200",
};

// ─── Work Order Priority ──────────────────────────────────────────────────────

export const WO_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const WO_PRIORITY_COLORS: Record<WorkOrderPriority, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-red-100 text-red-700 border-red-200",
  critical: "bg-red-200 text-red-900 border-red-300",
};

// ─── Product Category ─────────────────────────────────────────────────────────

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  maintenance_part: "Maintenance Part",
  stocked_material: "Stocked Material",
  project_material: "Project Material",
};

export const PRODUCT_CATEGORY_COLORS: Record<ProductCategory, string> = {
  maintenance_part: "bg-purple-100 text-purple-700 border-purple-200",
  stocked_material: "bg-teal-100 text-teal-700 border-teal-200",
  project_material: "bg-orange-100 text-orange-700 border-orange-200",
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
  sold: "bg-purple-100 text-purple-700 border-purple-200",
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-green-100 text-green-800 border-green-200",
  complete: "bg-teal-100 text-teal-800 border-teal-200",
  on_hold: "bg-yellow-100 text-yellow-800 border-yellow-200",
  canceled: "bg-slate-100 text-slate-600 border-slate-200",
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
  active: "bg-green-100 text-green-800 border-green-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  in_shop: "bg-yellow-100 text-yellow-800 border-yellow-200",
  out_of_service: "bg-red-100 text-red-700 border-red-200",
  disposed: "bg-slate-200 text-slate-500 border-slate-300",
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
  open: "bg-blue-50 text-blue-700 border-blue-200",
  in_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  converted: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
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
