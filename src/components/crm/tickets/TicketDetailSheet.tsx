"use client";

import { useState } from "react";
import {
  useCloseTicket,
  useUpdateTicket,
  useTicketLinks,
  useAddTicketLink,
  useRemoveTicketLink,
} from "@/lib/hooks/use-tickets";
import { useComments, useAddComment } from "@/lib/hooks/use-comments";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useInvoices } from "@/lib/hooks/use-invoices";
import { useJobsList } from "@/lib/hooks/use-crm-jobs";
import { useCurrentUserStore } from "@/stores";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { CRMTicket, TicketStatus, TicketPriority } from "@/types/crm-tickets";

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "border border-red-400 text-red-600",
  closed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_CLASS[status])}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", PRIORITY_CLASS[priority])}>
      {priority}
    </span>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + (d.includes("T") ? "" : "T12:00:00")).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── linked records picker ─────────────────────────────────────────────────────

function LinkedRecordsPicker({
  ticket,
}: {
  ticket: CRMTicket;
}) {
  const addLink = useAddTicketLink();
  const removeLink = useRemoveTicketLink();
  const { data: links } = useTicketLinks(ticket.id);
  const [newLinkType, setNewLinkType] = useState<"estimate" | "invoice" | "job">("estimate");
  const [selectedId, setSelectedId] = useState("");

  const clientId = ticket.clientId ?? "";

  const { data: estimates } = useEstimates(clientId || undefined);
  const { data: invoices } = useInvoices(clientId || undefined);
  const { data: jobs } = useJobsList(clientId ? { clientId } : undefined);

  const options: { id: string; label: string }[] =
    newLinkType === "estimate"
      ? (estimates ?? []).map((e) => ({
          id: e.id,
          label: `#${e.estimateNumber} — ${e.description || "(no description)"}`,
        }))
      : newLinkType === "invoice"
      ? (invoices ?? []).map((i) => ({
          id: i.id,
          label: `#${i.invoiceNumber} — ${i.description || "(no description)"}`,
        }))
      : (jobs ?? []).map((j) => ({
          id: j.id,
          label: j.serviceAddress || j.jobType || `Job ${j.id.slice(0, 8)}`,
        }));

  async function handleAdd() {
    if (!selectedId) return;
    const opt = options.find((o) => o.id === selectedId);
    if (!opt) return;
    await addLink.mutateAsync({
      ticketId: ticket.id,
      linkType: newLinkType,
      linkedId: selectedId,
      linkedLabel: opt.label,
    });
    setSelectedId("");
  }

  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2">Linked Records</p>
      {(links ?? []).length === 0 ? (
        <p className="text-xs text-slate-400 mb-3">No links yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {(links ?? []).map((link) => (
            <li key={link.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                {link.linkType}
              </Badge>
              <span className="flex-1 text-slate-700 truncate text-xs">{link.linkedLabel}</span>
              <button
                type="button"
                className="text-slate-400 hover:text-red-500"
                onClick={() => removeLink.mutate({ id: link.id, ticketId: ticket.id })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border bg-slate-50 p-3 space-y-2">
        <p className="text-xs font-medium text-slate-500">Add Link</p>
        <div className="flex gap-2">
          <Select
            value={newLinkType}
            onValueChange={(v) => { setNewLinkType(v as "estimate" | "invoice" | "job"); setSelectedId(""); }}
          >
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="estimate">Estimate</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="job">Job</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder={clientId ? `Select ${newLinkType}…` : "No client on ticket"} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <SelectItem value="__empty" disabled>
                  {clientId ? `No ${newLinkType}s found` : "Ticket has no client"}
                </SelectItem>
              ) : (
                options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleAdd}
          disabled={addLink.isPending || !selectedId}
        >
          {addLink.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

// ── main sheet ────────────────────────────────────────────────────────────────

export interface TicketDetailSheetProps {
  ticket: CRMTicket | null;
  onClose: () => void;
}

export function TicketDetailSheet({ ticket, onClose }: TicketDetailSheetProps) {
  const closeTicket = useCloseTicket();
  const updateTicket = useUpdateTicket();
  const addComment = useAddComment();
  const { currentUser } = useCurrentUserStore();

  const [commentBody, setCommentBody] = useState("");

  const { data: comments } = useComments("ticket", ticket?.id ?? "");

  if (!ticket) return null;

  async function handleStatusChange(status: TicketStatus) {
    if (!ticket) return;
    if (status === "closed") {
      await closeTicket.mutateAsync(ticket.id);
    } else {
      await updateTicket.mutateAsync({ id: ticket.id, updates: { status } });
    }
  }

  async function handleAddComment() {
    if (!ticket || !commentBody.trim()) return;
    await addComment.mutateAsync({
      recordType: "ticket",
      recordId: ticket.id,
      authorName: currentUser.name,
      body: commentBody.trim(),
    });
    setCommentBody("");
  }

  const isUpdating = closeTicket.isPending || updateTicket.isPending;

  return (
    <Sheet open={!!ticket} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-base">
            #{ticket.ticketNumber} — {ticket.subject ?? "(no subject)"}
          </SheetTitle>
          <div className="flex flex-wrap gap-2 pt-1">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600">
              {ticket.type}
            </span>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex-1 flex flex-col">
          <TabsList className="mx-6 mt-4 mb-0 w-auto justify-start rounded-none border-b bg-transparent p-0 gap-0">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent px-4 pb-2 pt-0 text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Details
            </TabsTrigger>
            <TabsTrigger value="comments" className="rounded-none border-b-2 border-transparent px-4 pb-2 pt-0 text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Comments {comments && comments.length > 0 && `(${comments.length})`}
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent px-4 pb-2 pt-0 text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Details tab */}
          <TabsContent value="details" className="flex-1 px-6 py-4 space-y-5 mt-0">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-400">Client</dt>
                <dd className="mt-0.5 text-slate-700">{ticket.clientName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Category</dt>
                <dd className="mt-0.5 text-slate-700">{ticket.category ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Assigned To</dt>
                <dd className="mt-0.5 text-slate-700">{ticket.assignedTo ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Due Date</dt>
                <dd className="mt-0.5 text-slate-700">{formatDate(ticket.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Created</dt>
                <dd className="mt-0.5 text-slate-700">{formatDate(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Last Updated</dt>
                <dd className="mt-0.5 text-slate-700">{formatDate(ticket.updatedAt)}</dd>
              </div>
              {ticket.closedAt && (
                <div>
                  <dt className="text-xs font-medium text-slate-400">Closed</dt>
                  <dd className="mt-0.5 text-slate-700">{formatDate(ticket.closedAt)}</dd>
                </div>
              )}
            </dl>

            {ticket.body && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">Notes</p>
                <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700 leading-relaxed">
                  {ticket.body}
                </p>
              </div>
            )}

            {/* Status actions */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Change Status</p>
              <div className="flex gap-2 flex-wrap">
                {ticket.status !== "open" && (
                  <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50 text-xs"
                    onClick={() => handleStatusChange("open")} disabled={isUpdating}>
                    Reopen
                  </Button>
                )}
                {ticket.status !== "pending" && (
                  <Button variant="outline" size="sm" className="text-yellow-700 border-yellow-300 hover:bg-yellow-50 text-xs"
                    onClick={() => handleStatusChange("pending")} disabled={isUpdating}>
                    Mark Pending
                  </Button>
                )}
                {ticket.status !== "closed" && (
                  <Button variant="outline" size="sm" className="text-green-700 border-green-300 hover:bg-green-50 text-xs"
                    onClick={() => handleStatusChange("closed")} disabled={isUpdating}>
                    {isUpdating ? "Saving…" : "Close Ticket"}
                  </Button>
                )}
              </div>
            </div>

            <LinkedRecordsPicker ticket={ticket} />
          </TabsContent>

          {/* Comments tab */}
          <TabsContent value="comments" className="flex-1 px-6 py-4 space-y-4 mt-0">
            <div className="space-y-3">
              {(comments ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No comments yet.</p>
              ) : (
                (comments ?? []).map((comment) => (
                  <div key={comment.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-slate-700">{comment.authorName}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(comment.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-slate-600 leading-relaxed">{comment.body}</p>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
                className="text-sm"
                placeholder="Add a comment…"
              />
              <Button size="sm" onClick={handleAddComment}
                disabled={addComment.isPending || !commentBody.trim()} className="text-xs">
                {addComment.isPending ? "Posting…" : "Add Comment"}
              </Button>
            </div>
          </TabsContent>

          {/* Activity tab */}
          <TabsContent value="activity" className="flex-1 px-6 py-4 mt-0">
            <AuditTrailTab recordType="ticket" recordId={ticket.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
