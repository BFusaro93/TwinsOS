"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import { useClient } from "@/lib/hooks/use-clients";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { useSendTicketEmail } from "@/lib/hooks/use-tickets";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import type { CRMTicket, TicketStatus } from "@/types/crm-tickets";

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

const MERGE_TAGS = [
  { tag: "[clientfirstname]", label: "Client First Name" },
  { tag: "[clientfullname]", label: "Client Full Name" },
  { tag: "[companyname]", label: "Company Name" },
  { tag: "[companyphonenumber]", label: "Company Phone" },
];

// Document types that make sense to send about a ticket: plain client letters
// and general (marketing-type) templates. Estimate / invoice / chemical / SMS
// templates need records a ticket doesn't have.
const ALLOWED_DOC_TYPES = ["client", "marketing"];

export function TicketEmailDialog({
  ticket,
  open,
  onClose,
}: {
  ticket: CRMTicket;
  open: boolean;
  onClose: () => void;
}) {
  const { data: client, isLoading: clientLoading } = useClient(ticket.clientId ?? "");
  const { data: allDocs = [] } = useDocumentTemplates();
  const docs = allDocs.filter((d) => d.status === "active" && ALLOWED_DOC_TYPES.includes(d.docType));
  const send = useSendTicketEmail();
  const editorRef = useRef<RichTextEditorHandle>(null);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [statusAfter, setStatusAfter] = useState<TicketStatus>(ticket.status);
  const [pendingDocId, setPendingDocId] = useState("");
  const { data: pendingDoc, isError: pendingDocError } = useDocumentTemplate(pendingDocId);
  const loadingDoc = !!pendingDocId && !pendingDoc && !pendingDocError;

  // Once the chosen document's blocks load, append them to the body. Merge tags
  // stay unresolved here; the send route fills them from the ticket's client.
  useEffect(() => {
    if (!pendingDocId) return;
    if (pendingDocError) {
      toast.error("Could not load that document");
      setPendingDocId("");
      return;
    }
    if (!pendingDoc) return;
    const html = renderBlocksToHtml(pendingDoc.blocks, {}, { preserveUnresolvedKnownTags: true });
    setBodyHtml((prev) => (prev.trim() ? `${prev}${html}` : html));
    setPendingDocId("");
  }, [pendingDoc, pendingDocError, pendingDocId]);

  // Reset whenever the dialog opens for a ticket.
  useEffect(() => {
    if (!open) return;
    setSubject(ticket.subject ? `Re: ${ticket.subject}` : `Ticket #${ticket.ticketNumber}`);
    setBodyHtml("");
    setStatusAfter(ticket.status);
  }, [open, ticket.id, ticket.subject, ticket.ticketNumber, ticket.status]);

  useEffect(() => {
    if (open) setTo(client?.primaryEmail ?? "");
  }, [open, client?.primaryEmail]);

  async function handleSend() {
    try {
      await send.mutateAsync({
        ticketId: ticket.id,
        to: to.trim(),
        subject: subject.trim(),
        bodyHtml,
        statusAfter,
      });
      toast.success(`Email sent to ${to.trim()}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    }
  }

  const noClient = !ticket.clientId;
  const noEmail = !noClient && !clientLoading && !client?.primaryEmail && !to.trim();
  const bodyEmpty = !bodyHtml.replace(/<[^>]*>/g, "").trim();
  const canSend = !noClient && !!to.trim() && !!subject.trim() && !bodyEmpty && !send.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email client — Ticket #{ticket.ticketNumber}</DialogTitle>
          <DialogDescription>
            Sent as a service email from your company. It will appear in this ticket&apos;s Emails history.
          </DialogDescription>
        </DialogHeader>

        {noClient ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            This ticket isn&apos;t linked to a client, so there is no one to email. Edit the ticket and choose a client first.
          </p>
        ) : (
          <div className="space-y-3 py-1">
            {noEmail && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {ticket.clientName ?? "This client"} has no email address on file. Type one below, or add it to the client record.
              </p>
            )}
            <div className="flex items-center gap-3">
              <Label className="w-24 shrink-0 text-xs">To</Label>
              <Input value={to} onChange={(e) => setTo(e.target.value)} type="email" className="h-8 text-xs" placeholder="client@example.com" />
            </div>
            <div className="flex items-center gap-3">
              <Label className="w-24 shrink-0 text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex items-center gap-3">
              <Label className="w-24 shrink-0 text-xs">Insert document</Label>
              <Select
                value=""
                onValueChange={setPendingDocId}
                disabled={docs.length === 0 || loadingDoc}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={docs.length === 0 ? "No active documents" : loadingDoc ? "Loading…" : "Choose a document…"} />
                </SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <RichTextEditor
                ref={editorRef}
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Write your message…"
                minHeight={200}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MERGE_TAGS.map((mt) => (
                  <button
                    key={mt.tag}
                    type="button"
                    title={mt.label}
                    onClick={() => editorRef.current?.insertContent(mt.tag)}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-slate-600 hover:bg-brand-100 hover:text-brand-700 dark:text-neutral-400 dark:hover:bg-brand-900/40 dark:hover:text-brand-400"
                  >
                    {mt.tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label className="w-24 shrink-0 text-xs">Status after</Label>
              <Select value={statusAfter} onValueChange={(v) => setStatusAfter(v as TicketStatus)}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">Ticket status once the email is sent</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>Cancel</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {send.isPending ? "Sending…" : "Send email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
