"use client";

import { TicketsList } from "@/components/crm/tickets/TicketsList";

export function CallsList() {
  return (
    <TicketsList
      typeFilter="call"
      title="Calls"
      description="Inbound and outbound call log"
    />
  );
}
