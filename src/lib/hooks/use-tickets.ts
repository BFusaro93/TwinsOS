"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMTicket, NewTicketFormValues, TicketStatus } from "@/types/crm-tickets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTicket(row: any): CRMTicket {
  return {
    id: row.id,
    orgId: row.org_id,
    ticketNumber: row.ticket_number,
    type: row.type,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    body: row.body,
    category: row.category,
    clientId: row.client_id,
    clientName: row.clients?.display_name ?? null,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function useTickets(filters?: { status?: TicketStatus; clientId?: string }) {
  return useQuery({
    queryKey: ["crm-tickets", filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("crm_tickets")
        .select("*, clients(display_name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.clientId) query = query.eq("client_id", filters.clientId);

      const { data, error } = await query;
      if (error) throw error;
      return (data.map(mapTicket)) as CRMTicket[];
    },
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["crm-tickets", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_tickets")
        .select("*, clients(display_name)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapTicket(data);
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewTicketFormValues) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_tickets")
        .insert({
          created_by: user?.id ?? null,
          type: values.type,
          client_id: values.clientId || null,
          category: values.category || null,
          subject: values.subject || null,
          body: values.body || null,
          status: values.status,
          assigned_to: values.assignedTo || null,
          due_date: values.dueDate || null,
          priority: values.priority,
        })
        .select("*, clients(display_name)")
        .single();
      if (error) throw error;
      const ticket = mapTicket(data);
      if (values.clientId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("client_activity").insert({
          client_id: values.clientId,
          activity_type: "ticket",
          subject: values.subject || `${values.type} ticket`,
          body: values.body || null,
          status: values.status,
          ref_id: ticket.id,
          ref_table: "crm_tickets",
        });
      }
      return ticket;
    },
    onSuccess: (_data, values) => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
      if (values.clientId) {
        qc.invalidateQueries({ queryKey: ["clients", values.clientId, "activity"] });
      }
    },
  });
}

const TICKET_TYPES = ["note", "call", "event"];
const TICKET_STATUSES = ["open", "closed", "pending", "on_hold"];
const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"];

export function useBulkImportTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data: clients } = await supabase.from("clients").select("id, display_name").is("deleted_at", null);
      const byName = new Map((clients ?? []).map((c) => [c.display_name.trim().toLowerCase(), c.id]));

      let created = 0;
      let skipped = 0;

      for (const r of rows) {
        const subject = r.subject?.trim();
        if (!subject) { skipped++; continue; }

        const clientId = r.clientName?.trim() ? byName.get(r.clientName.trim().toLowerCase()) ?? null : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("crm_tickets").insert({
          created_by: user?.id ?? null,
          type: TICKET_TYPES.includes(r.type?.trim().toLowerCase()) ? r.type.trim().toLowerCase() : "note",
          client_id: clientId,
          category: r.category?.trim() || null,
          subject,
          body: r.body?.trim() || null,
          status: (() => {
            // "On Hold" (space-separated, as a person would type it in a CSV)
            // needs to match the "on_hold" status value, not just "on hold".
            const normalized = r.status?.trim().toLowerCase().replace(/\s+/g, "_");
            return TICKET_STATUSES.includes(normalized) ? normalized : "open";
          })(),
          priority: TICKET_PRIORITIES.includes(r.priority?.trim().toLowerCase()) ? r.priority.trim().toLowerCase() : "normal",
          due_date: r.dueDate?.trim() || null,
        });
        if (error) throw error;
        created++;
      }

      return { created, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<NewTicketFormValues> }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {};
      if (updates.type !== undefined) payload.type = updates.type;
      if (updates.clientId !== undefined) payload.client_id = updates.clientId;
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.subject !== undefined) payload.subject = updates.subject;
      if (updates.body !== undefined) payload.body = updates.body;
      if (updates.status !== undefined) {
        payload.status = updates.status;
        // Keep closed_at in sync with status everywhere a status change can
        // happen (bulk actions included) — not just the single-ticket path,
        // which used a separate useCloseTicket call for this. Otherwise a
        // bulk "Mark Closed" never sets it, and reopening a closed ticket
        // leaves a stale closed_at behind.
        payload.closed_at = updates.status === "closed" ? new Date().toISOString() : null;
      }
      if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo || null;
      if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
      if (updates.priority !== undefined) payload.priority = updates.priority;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_tickets").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
  });
}

export interface TicketLink {
  id: string;
  ticketId: string;
  linkType: "estimate" | "invoice" | "job";
  linkedId: string;
  linkedLabel: string;
  createdAt: string;
}

export function useTicketLinks(ticketId: string) {
  return useQuery({
    queryKey: ["crm-ticket-links", ticketId],
    queryFn: async () => {
      const supabase = createClient();
      // crm_ticket_links not yet in generated types — cast as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_ticket_links")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((row): TicketLink => ({
        id: row.id,
        ticketId: row.ticket_id,
        linkType: row.link_type,
        linkedId: row.linked_id,
        linkedLabel: row.linked_label,
        createdAt: row.created_at,
      }));
    },
    enabled: !!ticketId,
  });
}

export function useAddTicketLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ticketId: string;
      linkType: "estimate" | "invoice" | "job";
      linkedId: string;
      linkedLabel: string;
    }) => {
      const supabase = createClient();
      // crm_ticket_links not yet in generated types — cast as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_ticket_links").insert({
        ticket_id: input.ticketId,
        link_type: input.linkType,
        linked_id: input.linkedId,
        linked_label: input.linkedLabel,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ["crm-ticket-links", ticketId] });
    },
  });
}

export function useRemoveTicketLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ticketId }: { id: string; ticketId: string }) => {
      const supabase = createClient();
      // crm_ticket_links not yet in generated types — cast as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_ticket_links").delete().eq("id", id);
      if (error) throw error;
      return { ticketId };
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ["crm-ticket-links", ticketId] });
    },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_tickets")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_tickets")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
  });
}
