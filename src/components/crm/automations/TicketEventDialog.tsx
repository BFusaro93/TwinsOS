"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { renderBlocksToPlainText } from "@/lib/utils/document-template-renderer";
import type { CRMSequenceEvent } from "@/types/crm-automations";
import { toast } from "sonner";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

// Client merge tags a ticket's subject and description can use. They are filled in
// from the enrolled client when the ticket is created. (Estimate/invoice/visit tags
// aren't available here — a ticket step has no such record.)
const TICKET_MERGE_TAGS = [
  { tag: "[clientname]", label: "Client's name" },
  { tag: "[clientfirstname]", label: "Client's first name" },
  { tag: "[clientlastname]", label: "Client's last name" },
  { tag: "[clientemail]", label: "Client's email" },
  { tag: "[clientcellphone]", label: "Client's cell phone" },
  { tag: "[clienthomephone]", label: "Client's home phone" },
  { tag: "[clientworkphone]", label: "Client's work phone" },
  { tag: "[accountnumber]", label: "Account number" },
  { tag: "[clientaccountbalance]", label: "Account balance" },
  { tag: "[physicaladdress1]", label: "Service address" },
  { tag: "[physicalcity]", label: "Service city" },
  { tag: "[billingaddress1]", label: "Billing address" },
  { tag: "[salesperson]", label: "Client's sales rep" },
  { tag: "[companyname]", label: "Your company name" },
];

const TICKET_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "event", label: "Event" },
  { value: "text", label: "Text" },
];

export function TicketEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const { data: employees } = useSelectableEmployees();
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const c = event.config;
  const [title, setTitle] = useState<string>(c.title ?? "");
  const [description, setDescription] = useState<string>(c.description ?? "");
  const [priority, setPriority] = useState<string>(c.priority ?? "normal");
  const [assignTo, setAssignTo] = useState<string>(c.assign_to ?? "");
  const [assignToSalesRep, setAssignToSalesRep] = useState<boolean>(c.assign_to_sales_rep === true);
  const [category, setCategory] = useState<string>(c.category ?? "");
  const [type, setType] = useState<string>(c.type ?? "note");
  const [status, setStatus] = useState<string>(c.status ?? "open");
  const [dueInDays, setDueInDays] = useState<string>(typeof c.due_in_days === "number" ? String(c.due_in_days) : "");
  // Linked document: its CURRENT text is the ticket description at creation time, so
  // editing the document updates every automation ticket that uses it.
  const [linkedDocId, setLinkedDocId] = useState<string>(c.document_template_id ?? "");
  const [saving, setSaving] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [lastFocus, setLastFocus] = useState<"title" | "description">("description");

  const { data: allDocs = [] } = useDocumentTemplates();
  const docs = allDocs.filter((d) => d.status === "active" && d.docType !== "estimate");
  const { data: linkedDoc } = useDocumentTemplate(linkedDocId);
  const linkedText = linkedDoc ? renderBlocksToPlainText(linkedDoc.blocks) : "";

  function insertTag(tag: string) {
    const target = lastFocus === "title" ? titleRef.current : descriptionRef.current;
    const value = lastFocus === "title" ? title : description;
    const setValue = lastFocus === "title" ? setTitle : setDescription;
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + tag + value.slice(end));
    requestAnimationFrame(() => {
      target?.focus();
      const pos = start + tag.length;
      target?.setSelectionRange(pos, pos);
    });
  }

  /** Stop following the document and keep its current text as the editable description. */
  function unlinkDocument() {
    if (linkedText) setDescription(linkedText);
    setLinkedDocId("");
  }

  async function handleSave() {
    const days = dueInDays.trim() === "" ? null : Number(dueInDays);
    if (days !== null && (!Number.isInteger(days) || days < 0)) {
      toast.error("Due in days must be a whole number of 0 or more (or blank for no due date).");
      return;
    }
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: {
          title,
          // Fallback copy of the linked document's text, refreshed at every save.
          description: linkedDocId && linkedText ? linkedText : description,
          priority,
          assign_to: assignTo,
          assign_to_sales_rep: assignToSalesRep,
          category: category || null,
          type,
          status,
          due_in_days: days,
          document_template_id: linkedDocId || null,
        },
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to save ticket event"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ticket Event</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Subject</Label>
            <Input
              ref={titleRef}
              placeholder="Ticket subject"
              value={title}
              onFocus={() => setLastFocus("title")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {category && !(categoryOptions ?? []).some((o) => o.value === category) && (
                    <SelectItem value={category}>{category}</SelectItem>
                  )}
                  {(categoryOptions ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due in days</Label>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="No due date"
                value={dueInDays}
                onChange={(e) => setDueInDays(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Assign To</Label>
              <Select value={assignTo || "none"} onValueChange={(v) => setAssignTo(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(employees ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="ticket-assign-sales-rep"
              checked={assignToSalesRep}
              onCheckedChange={(v) => setAssignToSalesRep(v === true)}
            />
            <Label htmlFor="ticket-assign-sales-rep" className="cursor-pointer font-normal leading-snug">
              Assign to the client&apos;s sales rep
              <span className="block text-[11px] text-slate-500 dark:text-neutral-400">
                When the client has a sales rep they get the ticket; otherwise it goes to the user chosen above.
              </span>
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            {docs.length > 0 && (
              <div className="flex flex-col gap-1">
                <Select value={linkedDocId || "none"} onValueChange={(v) => (v === "none" ? unlinkDocument() : setLinkedDocId(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a document for the ticket contents…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Custom ticket — write it below</SelectItem>
                    {linkedDocId && !docs.some((d) => d.id === linkedDocId) && (
                      <SelectItem value={linkedDocId}>{linkedDoc?.name ?? "Linked document"}</SelectItem>
                    )}
                    {docs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkedDocId && (
                  <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                    The ticket uses the document&apos;s current text — edit the document under Documents and new tickets pick it up. Choose &quot;Custom ticket&quot; to keep a copy of the text here and edit it freely.
                  </p>
                )}
              </div>
            )}
            {linkedDocId ? (
              linkedDoc ? (
                linkedText ? (
                  <Textarea readOnly rows={6} value={linkedText} className="bg-muted/40" />
                ) : (
                  <p className="rounded bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                    This document has no text yet, so the ticket will use the description saved below until it does.
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-500">Loading document…</p>
              )
            ) : null}
            {(!linkedDocId || (linkedDoc && !linkedText)) && (
              <Textarea
                ref={descriptionRef}
                placeholder="Ticket description…"
                rows={5}
                value={description}
                onFocus={() => setLastFocus("description")}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 dark:text-neutral-500">
                Insert merge tag into the {lastFocus === "title" ? "subject" : "description"}:
              </span>
              {TICKET_MERGE_TAGS.map(({ tag, label }) => (
                <button
                  key={tag}
                  type="button"
                  title={label}
                  onClick={() => insertTag(tag)}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs text-slate-600 dark:text-neutral-400 hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors font-mono"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
