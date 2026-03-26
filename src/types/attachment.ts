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
  | "vendor";

export interface Attachment extends BaseRecord {
  recordType: AttachmentRecordType;
  recordId: string;
  fileName: string;
  fileSize: number; // bytes
  fileType: string; // MIME type
  storagePath: string;
  uploadedByName: string;
}
