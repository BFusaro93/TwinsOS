import type { BaseRecord } from "./common";

export type AuditAction =
  | "created"
  | "updated"
  | "status_changed"
  | "qty_adjusted"
  | "price_updated"
  | "vendor_changed"
  | "image_uploaded"
  | "deleted";

export type AuditRecordType =
  | "part"
  | "product"
  | "asset"
  | "vehicle"
  | "work_order"
  | "requisition"
  | "po"
  | "receiving"
  | "project"
  | "request"
  | "pm_schedule";

export interface AuditEntry extends BaseRecord {
  recordType: AuditRecordType;
  recordId: string;
  action: AuditAction;
  changedByName: string;
  /** Human-readable description, e.g. "Unit cost updated" */
  description: string;
  /** The specific field that changed, if applicable */
  fieldChanged: string | null;
  /** Previous value as a display string */
  oldValue: string | null;
  /** New value as a display string */
  newValue: string | null;
}
