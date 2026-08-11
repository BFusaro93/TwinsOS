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
  /** profiles.id of the assignee, resolved from crm_employees.user_id at
   *  assignment time — null if unassigned, or if the assigned employee has
   *  no linked login (assignedTo the display name still works either way). */
  assignedToId: string | null;
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
  assignedToId?: string | null;
  dueDate: string;
  priority: TicketPriority;
}
