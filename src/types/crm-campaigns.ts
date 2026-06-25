export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type CampaignType = "email" | "sms" | "postcard";

export type CampaignSegment =
  | "all_clients"
  | "active_clients"
  | "leads"
  | "past_clients"
  | "custom";

export interface CRMCampaign {
  id: string;
  orgId: string;
  name: string;
  status: CampaignStatus;
  type: CampaignType;
  targetSegment: CampaignSegment;
  subject: string | null;
  body: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  unsubscribedCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NewCampaignFormValues {
  name: string;
  type: CampaignType;
  targetSegment: CampaignSegment;
  subject: string;
  body: string;
  scheduledAt: string | null;
}
