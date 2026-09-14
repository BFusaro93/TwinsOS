import { BaseRecord } from "./common";

export type CommentRecordType =
  | "requisition"
  | "po"
  | "receiving"
  | "project"
  | "work_order"
  | "job_photo"
  | "damage_case"
  | "ticket"
  | "crm_estimate";

export interface Comment extends BaseRecord {
  recordType: CommentRecordType;
  recordId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentionedUserIds: string[];
}
