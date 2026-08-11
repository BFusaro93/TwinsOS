export type NotificationEntityType =
  | "requisition"
  | "purchase_order"
  | "work_order"
  | "pm_schedule"
  | "part"
  | "estimate"
  | "ticket"
  | "contract"
  | null;

export interface AppNotification {
  id: string;
  type:
    | "approval_required"
    | "approved"
    | "rejected"
    | "wo_assigned"
    | "wo_overdue"
    | "low_stock"
    | "pm_due"
    | "wo_status_changed"
    | "wo_comment"
    | "estimate_change_request"
    | "estimate_client_accepted"
    | "estimate_client_rejected"
    | "ticket_created"
    | "ticket_assigned"
    | "ticket_comment"
    | "contract_signed";
  title: string;
  body: string;
  href: string;
  entityId: string | null;
  entityType: NotificationEntityType;
  createdAt: string;
  readAt: string | null;
}
