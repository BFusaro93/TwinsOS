import { BaseRecord } from "./common";

export type AttachmentRecordType =
  | "requisition"
  | "po"
  | "receiving"
  | "project"
  | "work_order"
  | "request"
  | "vehicle"
  | "asset"
  | "vendor"
  | "estimate"
  | "ticket"
  | "damage_case"
  | "injury_case"
  | "contract"
  | "job"
  | "product"
  | "employee";

export interface Attachment extends BaseRecord {
  recordType: AttachmentRecordType;
  recordId: string;
  fileName: string;
  fileSize: number; // bytes
  fileType: string; // MIME type
  storagePath: string;
  uploadedByName: string;
  /** Employee files only: what kind of document this is (see EMPLOYEE_DOCUMENT_TYPES). */
  documentType: string | null;
}
