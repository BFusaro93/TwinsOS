export type SalesMeetingType = 'in_person' | 'phone' | 'video';
export type SalesMeetingStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show';

export interface SalesMeeting {
  id: string;
  orgId: string;
  salesRepId: string;
  clientId: string | null;
  leadName: string | null;
  title: string;
  meetingType: SalesMeetingType;
  location: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: SalesMeetingStatus;
  notes: string | null;
  estimateId: string | null;
  ticketId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface SalesRepOption {
  id: string;
  name: string;
  mapIconColor: string | null;
}
