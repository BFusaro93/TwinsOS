"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fireAutomationTrigger } from "@/lib/automations/fire-trigger-client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { normalizeCsvDate } from "@/lib/hooks/use-invoices";
import type { BulkImportResult } from "@/lib/csv";
import type { CRMTicket, NewTicketFormValues, TicketStatus } from "@/types/crm-tickets";

const log = logger.child("use-tickets");

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
    upsellServiceId: row.upsell_service_id ?? null,
    clientName: row.clients?.display_name ?? null,
    assignedTo: row.assigned_to,
    assignedToId: row.assigned_to_id ?? null,
    dueDate: row.due_date,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    smsConsentPendingPhone: row.sms_consent_pending_phone ?? false,
    visibleToClient: row.visible_to_client ?? false,
  };
}

export function useTickets(filters?: { status?: TicketStatus; clientId?: string }) {
  return useQuery({
    queryKey: ["crm-tickets", filters],
    queryFn: async () => {
      const supabase = createClient();
      // PostgREST caps a response at 1000 rows — page through so older
      // tickets don't silently drop off the list once an org passes that.
      // `id` breaks created_at ties so pages never skip/repeat rows.
      const rows = await fetchAllRows<unknown>(() => {
        let query = supabase
          .from("crm_tickets")
          .select("*, clients(display_name)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id");

        if (filters?.status) query = query.eq("status", filters.status);
        if (filters?.clientId) query = query.eq("client_id", filters.clientId);
        return query;
      });
      return rows.map(mapTicket) as CRMTicket[];
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
          assigned_to_id: values.assignedToId ?? null,
          due_date: values.dueDate || null,
          priority: values.priority,
          // Only meaningful with a client — the portal matches on client_id.
          visible_to_client: !!values.clientId && !!values.visibleToClient,
        })
        .select("*, clients(display_name)")
        .single();
      if (error) throw error;
      const ticket = mapTicket(data);
      if (values.clientId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: activityError } = await (supabase as any).from("client_activity").insert({
          client_id: values.clientId,
          activity_type: "ticket",
          subject: values.subject || `${values.type} ticket`,
          body: values.body || null,
          status: values.status,
          ref_id: ticket.id,
          ref_table: "crm_tickets",
        });
        if (activityError) log.error("client_activity insert failed", { ticketId: ticket.id, error: activityError.message });
      }
      return ticket;
    },
    onSuccess: (ticket, values) => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
      if (values.clientId) {
        qc.invalidateQueries({ queryKey: ["clients", values.clientId, "activity"] });
      }
      fetch(`/api/crm/tickets/${ticket.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "created" }),
      }).catch(() => {});
      if (values.clientId) {
        fireAutomationTrigger({
          triggerType: "ticket_created",
          clientId: values.clientId,
          ticketId: ticket.id,
          matchValues: values.category ? [values.category] : undefined,
        });
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
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Paged: past PostgREST's 1000-row cap, clients would be missing here and
      // their tickets imported unlinked.
      const clients = await fetchAllRows<{ id: string; display_name: string }>(() =>
        supabase.from("clients").select("id, display_name").is("deleted_at", null).order("id"),
      );
      // Two clients can share a display name: a plain Map let the LAST one
      // silently win, filing the ticket on the wrong client. Track every id per
      // name and report ambiguous rows instead (the estimate/invoice importers do).
      const idsByName = new Map<string, string[]>();
      for (const c of clients) {
        const key = c.display_name.trim().toLowerCase();
        idsByName.set(key, [...(idsByName.get(key) ?? []), c.id]);
      }

      let succeeded = 0;
      const failed: BulkImportResult["failed"] = [];

      for (const [idx, r] of rows.entries()) {
        const rowNum = idx + 1;
        try {
          const subject = r.subject?.trim();
          if (!subject) { failed.push({ row: rowNum, error: "Missing required field: Subject" }); continue; }

          const clientNameKey = r.clientName?.trim().toLowerCase() ?? "";
          const nameMatches = clientNameKey ? idsByName.get(clientNameKey) ?? [] : [];
          if (nameMatches.length > 1) {
            failed.push({ row: rowNum, error: `"${subject}": more than one client is named "${r.clientName?.trim()}" — skipped` });
            continue;
          }
          const clientId = nameMatches[0] ?? null;

          // A due date typed M/D/YYYY (Excel's default) is not a valid Postgres
          // date literal; normalize it, and report a non-date instead of letting
          // the insert fail with an opaque error that used to abort the batch.
          const dueDateRaw = r.dueDate?.trim() ?? "";
          const dueDate = dueDateRaw ? normalizeCsvDate(dueDateRaw) : null;
          if (dueDateRaw && !dueDate) {
            failed.push({ row: rowNum, error: `"${subject}": due date "${dueDateRaw}" is not a valid date (use YYYY-MM-DD or M/D/YYYY)` });
            continue;
          }

          // "On Hold" (space-separated, as a person would type it in a CSV)
          // needs to match the "on_hold" status value, not just "on hold".
          const normalizedStatus = r.status?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
          const status = TICKET_STATUSES.includes(normalizedStatus) ? normalizedStatus : "open";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("crm_tickets").insert({
            created_by: user?.id ?? null,
            type: TICKET_TYPES.includes(r.type?.trim().toLowerCase()) ? r.type.trim().toLowerCase() : "note",
            client_id: clientId,
            category: r.category?.trim() || null,
            subject,
            body: r.body?.trim() || null,
            status,
            // closed_at is only ever set by the app (no trigger): an imported
            // closed ticket without it is missing from every closed-date report.
            closed_at: status === "closed" ? new Date().toISOString() : null,
            priority: TICKET_PRIORITIES.includes(r.priority?.trim().toLowerCase()) ? r.priority.trim().toLowerCase() : "normal",
            due_date: dueDate,
          });
          // One bad row must not abort the batch after earlier rows were written.
          if (error) { failed.push({ row: rowNum, error: `"${subject}": ${error.message}` }); continue; }
          succeeded++;
        } catch (err) {
          failed.push({ row: rowNum, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      return { succeeded, failed };
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

      let wasReopened = false;
      let wasClosed = false;
      let clientId: string | null = null;
      let effectiveCategory: string | null = null;
      // Guard against a TOCTOU race: another user could change the status
      // between this SELECT and the UPDATE below, making wasReopened reflect
      // stale state. beforeStatus is carried into the update itself as an
      // .eq("status", beforeStatus) guard (see below) so the update only
      // applies if nothing changed it in the meantime; a 0-row result means
      // a race happened and we refetch + retry once.
      let beforeStatus: string | null = null;
      // The edit sheet always submits the whole form, so `assignedTo` is present
      // on EVERY save. Notify the assignee only when the assignment actually
      // changed — otherwise fixing a due date re-sent "You were assigned ticket N".
      let assigneeChanged = false;
      if (updates.assignedTo !== undefined || updates.assignedToId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: prev } = await (supabase as any).from("crm_tickets").select("assigned_to, assigned_to_id").eq("id", id).single();
        const nextName = updates.assignedTo !== undefined ? (updates.assignedTo || null) : prev?.assigned_to ?? null;
        const nextId = updates.assignedToId !== undefined ? (updates.assignedToId ?? null) : prev?.assigned_to_id ?? null;
        assigneeChanged = nextId !== (prev?.assigned_to_id ?? null) || nextName !== (prev?.assigned_to ?? null);
      }
      // Also read the before-state when closing: a bulk "Mark Closed" goes
      // through this hook, and without it the ticket_closed automation trigger
      // (which useCloseTicket fires) was silently skipped for those tickets.
      const checkReopen = updates.status !== undefined;
      if (checkReopen) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: before } = await (supabase as any).from("crm_tickets").select("status, client_id, category").eq("id", id).single();
        beforeStatus = before?.status ?? null;
        wasReopened = before?.status === "closed" && updates.status !== "closed";
        wasClosed = before?.status !== "closed" && updates.status === "closed";
        clientId = before?.client_id ?? null;
        effectiveCategory = updates.category !== undefined ? updates.category : before?.category ?? null;
      }

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
      if (updates.assignedToId !== undefined) payload.assigned_to_id = updates.assignedToId ?? null;
      if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.visibleToClient !== undefined) payload.visible_to_client = updates.visibleToClient;

      if (checkReopen) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("crm_tickets")
          .update(payload)
          .eq("id", id)
          .eq("status", beforeStatus)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          // Status changed underneath us between the SELECT and this UPDATE —
          // refetch fresh state and retry the reopen-detection + update once.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: fresh } = await (supabase as any).from("crm_tickets").select("status, client_id, category").eq("id", id).single();
          beforeStatus = fresh?.status ?? null;
          wasReopened = fresh?.status === "closed" && updates.status !== "closed";
          wasClosed = fresh?.status !== "closed" && updates.status === "closed";
          clientId = fresh?.client_id ?? clientId;
          effectiveCategory = updates.category !== undefined ? updates.category : fresh?.category ?? effectiveCategory;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const retry = await (supabase as any)
            .from("crm_tickets")
            .update(payload)
            .eq("id", id)
            .eq("status", beforeStatus)
            .select("id");
          if (retry.error) throw retry.error;
          if (!retry.data || retry.data.length === 0) {
            throw new Error(
              "This ticket was just changed by someone else. Please try again."
            );
          }
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("crm_tickets").update(payload).eq("id", id);
        if (error) throw error;
      }
      return { wasReopened, wasClosed, clientId, effectiveCategory, assigneeChanged };
    },
    onSuccess: (result, { id, updates }) => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
      if (result?.assigneeChanged && updates.assignedTo) {
        fetch(`/api/crm/tickets/${id}/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "assigned" }),
        }).catch(() => {});
      }
      if (result?.wasClosed && result.clientId) {
        fireAutomationTrigger({
          triggerType: "ticket_closed",
          clientId: result.clientId,
          ticketId: id,
          matchValues: result.effectiveCategory ? [result.effectiveCategory] : undefined,
        });
      }
      if (result?.wasReopened && result.clientId) {
        fireAutomationTrigger({
          triggerType: "ticket_reopened",
          clientId: result.clientId,
          ticketId: id,
          matchValues: result.effectiveCategory ? [result.effectiveCategory] : undefined,
        });
      }
    },
    onError: () => {
      toast.error("Failed to update ticket");
    },
  });
}

export type TicketLinkType = "estimate" | "invoice" | "job" | "project" | "damage_case";

export interface TicketLink {
  id: string;
  ticketId: string;
  linkType: TicketLinkType;
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

/** Tickets linked to a given record (e.g. a Project) via crm_ticket_links. */
export function useTicketsLinkedTo(linkType: TicketLink["linkType"], linkedId: string) {
  return useQuery({
    queryKey: ["crm-ticket-links-for", linkType, linkedId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: links, error: linksError } = await (supabase as any)
        .from("crm_ticket_links")
        .select("ticket_id")
        .eq("link_type", linkType)
        .eq("linked_id", linkedId);
      if (linksError) throw linksError;
      const ticketIds = (links as { ticket_id: string }[]).map((l) => l.ticket_id);
      if (ticketIds.length === 0) return [] as CRMTicket[];
      const { data, error } = await supabase
        .from("crm_tickets")
        .select("*, clients(display_name)")
        .in("id", ticketIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data.map(mapTicket)) as CRMTicket[];
    },
    enabled: !!linkedId,
  });
}

export function useAddTicketLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ticketId: string;
      linkType: TicketLinkType;
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
    onSuccess: (_data, { ticketId, linkType, linkedId }) => {
      qc.invalidateQueries({ queryKey: ["crm-ticket-links", ticketId] });
      qc.invalidateQueries({ queryKey: ["crm-ticket-links-for", linkType, linkedId] });
    },
    onError: () => {
      toast.error("Failed to add link");
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
      qc.invalidateQueries({ queryKey: ["crm-ticket-links-for"] });
    },
    onError: () => {
      toast.error("Failed to remove link");
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
    onError: () => {
      toast.error("Failed to delete ticket");
    },
  });
}

export function useClearSmsConsentPendingPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_tickets")
        .update({ sms_consent_pending_phone: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
    onError: () => {
      toast.error("Failed to dismiss warning");
    },
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_tickets")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", id)
        // Already closed: don't re-stamp closed_at or re-fire ticket_closed
        // (the bulk path through useUpdateTicket is guarded the same way).
        .neq("status", "closed")
        .select("client_id, category")
        .maybeSingle();
      if (error) throw error;
      return { closedNow: !!data, clientId: (data?.client_id ?? null) as string | null, category: (data?.category ?? null) as string | null };
    },
    onSuccess: (data, id) => {
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
      if (data?.closedNow && data.clientId) {
        fireAutomationTrigger({
          triggerType: "ticket_closed",
          clientId: data.clientId,
          ticketId: id,
          matchValues: data.category ? [data.category] : undefined,
        });
      }
    },
    onError: () => {
      toast.error("Failed to close ticket");
    },
  });
}
