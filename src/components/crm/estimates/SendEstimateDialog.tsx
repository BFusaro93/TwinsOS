"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEmailTemplates } from "@/lib/hooks/use-email-templates";
import { EMAIL_MERGE_TAGS } from "@/types/crm-proposals";

// Exported so bulk-send flows (EstimatesList's "Email Selected") send the
// same default content a single manual send would, when no org default
// template is configured.
export const DEFAULT_TEMPLATE_BODY = `<p>Hi [clientfirstname],</p>

<p>Please find your proposal from [companyname] attached below. Click the button to review the services included and accept online.</p>

<p style="margin:20px 0">[quotelink]</p>

<p>This proposal is valid for 30 days. If you have any questions, please don't hesitate to reach out.</p>

<p>Thank you,<br>[salesrepname]<br>[companyphonenumber]</p>`;

export const DEFAULT_SUBJECT = "Your Estimate from [companyname] — Estimate #[quotenumber]";

interface Props {
  estimateId: string;
  estimateNumber: number;
  clientName: string | null;
  clientEmail: string | null;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function SendEstimateDialog({
  estimateId, estimateNumber, clientName, clientEmail, open, onClose, onSent,
}: Props) {
  const { data: templates = [] } = useEmailTemplates("estimate");

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject]   = useState(DEFAULT_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_TEMPLATE_BODY);
  const [sending, setSending]   = useState(false);
  const [tab, setTab]           = useState<"compose" | "preview">("compose");
  const [toEmail, setToEmail]   = useState(clientEmail ?? "");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput]   = useState("");
  const ccInputRef = useRef<HTMLInputElement>(null);

  // Reset the editable "To" field whenever a different estimate's dialog
  // opens — otherwise a manually-edited address from a prior send would
  // linger since this dialog stays mounted between opens.
  useEffect(() => {
    if (open) setToEmail(clientEmail ?? "");
  }, [open, clientEmail]);

  // Load template when selected
  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl) { setSubject(tpl.subject); setBodyHtml(tpl.bodyHtml); }
  }, [selectedTemplateId, templates]);

  // Auto-select default template on open
  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault);
      if (def) { setSelectedTemplateId(def.id); setSubject(def.subject); setBodyHtml(def.bodyHtml); }
    }
  }, [open, templates, selectedTemplateId]);

  // Simple preview: replace merge tags with placeholder values for display
  function previewResolve(text: string) {
    return text
      .replace(/\[clientfirstname\]/gi,    clientName?.split(" ")[0] ?? "Client")
      .replace(/\[clientlastname\]/gi,     clientName?.split(" ").slice(1).join(" ") ?? "")
      .replace(/\[clientfullname\]/gi,     clientName ?? "Client")
      .replace(/\[companyname\]/gi,        "Your Company")
      .replace(/\[quotelink\]/gi,          `<a href="#" style="color:#fff;background:#60ab45;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">View Your Proposal →</a>`)
      .replace(/\[quotenumber\]/gi,        String(estimateNumber).padStart(5, "0"))
      .replace(/\[quotedate\]/gi,          new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
      .replace(/\[quotetotal\]/gi,         "$0.00")
      .replace(/\[salesrepname\]/gi,       "Your Rep")
      .replace(/\[companyphonenumber\]/gi, "(555) 000-0000");
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function commitCcInput() {
    const trimmed = ccInput.trim().replace(/,+$/, "");
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      toast.error(`"${trimmed}" is not a valid email address`);
      return;
    }
    if (!ccEmails.includes(trimmed)) {
      setCcEmails((prev) => [...prev, trimmed]);
    }
    setCcInput("");
  }

  function handleCcKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      commitCcInput();
    } else if (e.key === "Backspace" && ccInput === "" && ccEmails.length > 0) {
      setCcEmails((prev) => prev.slice(0, -1));
    }
  }

  function removeCcEmail(email: string) {
    setCcEmails((prev) => prev.filter((e) => e !== email));
  }

  async function handleSend() {
    const to = toEmail.trim();
    if (!to) {
      toast.error("Enter a recipient email address");
      return;
    }
    if (!isValidEmail(to)) {
      toast.error(`"${to}" is not a valid email address`);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/crm/estimates/${estimateId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml, expiresInDays: 30, ccEmails, to }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send");
      }
      toast.success(`Estimate sent to ${to}`);
      onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send estimate");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Estimate #{String(estimateNumber).padStart(5, "0")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* To */}
          <div className="flex items-center gap-3 rounded-md border bg-white px-3 py-2 text-sm">
            <span className="text-slate-400 text-xs font-medium w-8 shrink-0">To</span>
            <span className="shrink-0 font-medium text-slate-700">{clientName}</span>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 min-w-0 text-sm outline-none bg-transparent placeholder:text-slate-400"
            />
            {!clientEmail && !toEmail && (
              <Badge variant="destructive" className="shrink-0 text-[10px]">No email on file</Badge>
            )}
          </div>

          {/* CC */}
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm cursor-text min-h-[38px]"
            onClick={() => ccInputRef.current?.focus()}
          >
            <span className="text-slate-400 text-xs font-medium w-8 shrink-0">CC</span>
            {ccEmails.map((email) => (
              <span
                key={email}
                className="flex items-center gap-1 bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-xs"
              >
                {email}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeCcEmail(email); }}
                  className="text-slate-400 hover:text-slate-700 leading-none"
                  aria-label={`Remove ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={ccInputRef}
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={handleCcKeyDown}
              onBlur={commitCcInput}
              placeholder={ccEmails.length === 0 ? "Add CC recipients…" : ""}
              className="flex-1 min-w-[160px] text-xs outline-none bg-transparent placeholder:text-slate-400"
            />
          </div>

          {/* Template picker */}
          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-20 shrink-0 text-xs">Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Compose / Preview tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="h-8">
              <TabsTrigger value="compose" className="text-xs">Compose</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="compose" className="mt-2">
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={12}
                className="w-full rounded border border-slate-200 p-2 text-xs font-mono focus:border-brand-400 focus:outline-none resize-y"
                placeholder="Email body (HTML supported)…"
              />
              {/* Merge tag reference */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EMAIL_MERGE_TAGS.map((mt) => (
                  <button
                    key={mt.tag}
                    type="button"
                    title={mt.label}
                    onClick={() => setBodyHtml((b) => b + mt.tag)}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 hover:bg-brand-100 hover:text-brand-700"
                  >
                    {mt.tag}
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-2">
              <div
                className="min-h-[240px] rounded border bg-white p-4 text-sm overflow-auto"
                dangerouslySetInnerHTML={{ __html: previewResolve(bodyHtml) }}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={sending || !toEmail.trim() || !subject.trim() || !bodyHtml.trim()}
          >
            {sending ? "Sending…" : `Send to ${toEmail.trim() || "client"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
