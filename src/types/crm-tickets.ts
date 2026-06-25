export type TicketType = 'note' | 'call' | 'event';
export type TicketStatus = 'open' | 'on_hold' | 'pending' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CRMTicket {
  id: string;
  orgId: string;
  ticketNumber: number;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string | null;
  body: string | null;
  category: string | null;
  clientId: string | null;
  clientName: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NewTicketFormValues {
  type: TicketType;
  clientId: string | null;
  category: string;
  subject: string;
  body: string;
  status: TicketStatus;
  assignedTo: string;
  dueDate: string;
  priority: TicketPriority;
}
