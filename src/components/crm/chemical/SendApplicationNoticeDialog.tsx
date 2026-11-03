"use client";

import { escapeHtml } from "@/lib/utils/escape-html";
import { SandboxedHtmlPreview } from "@/components/shared/SandboxedHtmlPreview";
import { useState, useEffect } from "react";
import { useQuery } from "@/lib/hooks/use-query";
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
import { createClient } from "@/lib/supabase/client";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import { CHEMICAL_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";

export type ChemicalEmailKind = "chemical" | "chemical_recommendation" | "chemical_upsell";

const KIND_LABELS: Record<ChemicalEmailKind, string> = {
  chemical: "Client Instruction",
  chemical_recommendation: "Recommendation",
  chemical_upsell: "Upsale",
};

export const KIND_DEFAULTS: Record<ChemicalEmailKind, { subject: string; body: string }> = {
  chemical: {
    subject: "Notice of Treatment from [companyname] — [applicationdate]",
    body: `<p>Hi [clientfirstname],</p>

<p>Here is the record of today's treatment at your property from [companyname].</p>

[chemicalnotice]

<p>If you have any questions, please don't hesitate to reach out.</p>

<p>Thank you,<br>[companyname]<br>[companyphonenumber]</p>`,
  },
  chemical_recommendation: {
    subject: "A recommendation for your property from [companyname]",
    body: `<p>Hi [clientfirstname],</p>

<p>While we were at your property on [applicationdate], our technician noticed something we wanted to pass along:</p>

<p><em>Write your recommendation here.</em></p>

<p>If you'd like to talk it over, call us at [companyphonenumber].</p>

<p>Thank you,<br>[companyname]</p>`,
  },
  chemical_upsell: {
    subject: "Another way [companyname] can help your property",
    body: `<p>Hi [clientfirstname],</p>

<p>Thanks for letting us care for your property. Based on what we saw during your recent visit, you may be interested in:</p>

<p><em>Describe the additional service here.</em></p>

<p>Reply to this email or call [companyphonenumber] and we'll get you a quote.</p>

<p>Thank you,<br>[companyname]</p>`,
  },
};

interface Props {
  visitId: string;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  /** Which kind of chemical email to start on. Defaults to the post-application Client Instruction. */
  initialKind?: ChemicalEmailKind;
}

export function SendApplicationNoticeDialog({ visitId, open, onClose, onSent, initialKind = "chemical" }: Props) {
  // Email content templates live in Documents (doc type "chemical") — the
  // same block-based builder used for invoice-email/client templates.
  const { data: allDocTemplates = [] } = useDocumentTemplates();
  const [kind, setKind] = useState<ChemicalEmailKind>(initialKind);
  const templates = allDocTemplates.filter((t) => t.docType === kind && t.status === "active");

  const { data: visitInfo } = useQuery({
    queryKey: ["visit-client-info", visitId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_job_visits")
        .select("clients(display_name, primary_email)")
        .eq("id", visitId)
        .single();
      if (error) throw error;
      return {
        clientName: data.clients?.display_name ?? null,
        clientEmail: data.clients?.primary_email ?? null,
      };
    },
    enabled: open,
  });

  const clientName = visitInfo?.clientName ?? null;
  const clientEmail = visitInfo?.clientEmail ?? null;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const { data: selectedDocTemplate } = useDocumentTemplate(selectedTemplateId);
  const [subject, setSubject]   = useState(KIND_DEFAULTS[initialKind].subject);
  const [bodyHtml, setBodyHtml] = useState(KIND_DEFAULTS[initialKind].body);

  function changeKind(next: ChemicalEmailKind) {
    setKind(next);
    setSelectedTemplateId("");
    setSubject(KIND_DEFAULTS[next].subject);
    setBodyHtml(KIND_DEFAULTS[next].body);
  }
  const [sending, setSending]   = useState(false);
  const [attachPdf, setAttachPdf] = useState(true);
  const [tab, setTab]           = useState<"compose" | "preview">("compose");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput]   = useState("");

  // Once the chosen document template's blocks load, fill in subject/body —
  // merge tags are left unresolved for the send route's own resolver, same
  // as InvoiceEmailDialog / BulkEmailClientsDialog.
  useEffect(() => {
    if (!selectedDocTemplate) return;
    if (selectedDocTemplate.subject) setSubject(selectedDocTemplate.subject);
    setBodyHtml(renderBlocksToHtml(selectedDocTemplate.blocks, {}, { preserveUnresolvedKnownTags: true }));
  }, [selectedDocTemplate]);

  // Auto-select the org's default "chemical" document template on open.
  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0];
      if (def) setSelectedTemplateId(def.id);
    }
  }, [open, templates, selectedTemplateId]);

  function previewResolve(text: string) {
    return text
      .replace(/\[clientfirstname\]/gi,   () => escapeHtml(clientName?.split(" ")[0] ?? "Client"))
      .replace(/\[clientfullname\]/gi,    () => escapeHtml(clientName ?? "Client"))
      .replace(/\[companyname\]/gi,       () => escapeHtml("Your Company"))
      .replace(/\[applicationdate\]/gi,   () => escapeHtml(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })))
      .replace(/\[applicatorname\]/gi,    () => escapeHtml("Tech Name"))
      .replace(/\[applicatorlicense\]/gi, () => escapeHtml("12345"))
      .replace(/\[products\]/gi,          () => "<ul><li>Sample Product — 12 oz (EPA #12345-67)</li></ul>")
      .replace(/\[conditions\]/gi,        () => escapeHtml("72°F, Wind 5 mph NW"))
      .replace(/\[chemicalnotice\]/gi,   () => "<p><em>[The full Notice of Treatment appears here]</em></p>")
      .replace(/\[careinstructions\]/gi,  () => escapeHtml("Keep children and pets off the treated area until dry."))
      .replace(/\[companyphonenumber\]/gi, () => escapeHtml("(555) 000-0000"));
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
    if (!ccEmails.includes(trimmed)) setCcEmails((prev) => [...prev, trimmed]);
    setCcInput("");
  }

  async function handleSend() {
    if (!clientEmail) {
      toast.error("Client has no email address on file");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/crm/chemical-applications/${visitId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A one-off send from the panel is deliberate, so a repeat notice is allowed.
        body: JSON.stringify({ subject, bodyHtml, ccEmails, kind, attachPdf, resend: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send");
      }
      toast.success(`${KIND_LABELS[kind]} email sent to ${clientEmail}`);
      onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send notice");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Chemical Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 rounded-md border bg-slate-50 dark:bg-muted/40 px-3 py-2 text-sm">
            <span className="text-slate-400 dark:text-neutral-500 text-xs font-medium w-8">To</span>
            <span className="font-medium text-slate-700 dark:text-neutral-300">{clientName}</span>
            {clientEmail
              ? <span className="text-slate-400 dark:text-neutral-500">&lt;{clientEmail}&gt;</span>
              : <Badge variant="destructive" className="text-[10px]">No email on file</Badge>
            }
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-sm cursor-text min-h-[38px]"
            onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
          >
            <span className="text-slate-400 dark:text-neutral-500 text-xs font-medium w-8 shrink-0">CC</span>
            {ccEmails.map((email) => (
              <span key={email} className="flex items-center gap-1 bg-muted text-slate-700 dark:text-neutral-300 rounded px-1.5 py-0.5 text-xs">
                {email}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCcEmails((prev) => prev.filter((e2) => e2 !== email)); }}
                  className="text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300 leading-none"
                  aria-label={`Remove ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === "Tab") { e.preventDefault(); commitCcInput(); }
              }}
              onBlur={commitCcInput}
              placeholder={ccEmails.length === 0 ? "Add CC recipients…" : ""}
              className="flex-1 min-w-[160px] text-xs outline-none bg-transparent placeholder:text-slate-400 dark:placeholder:text-neutral-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Email type</Label>
            <Select value={kind} onValueChange={(v) => changeKind(v as ChemicalEmailKind)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as ChemicalEmailKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {kind === "chemical" && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              Attach the Notice of Treatment as a PDF
            </label>
          )}

          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-xs" />
          </div>

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
                className="w-full rounded border border-border p-2 text-xs font-mono focus:border-brand-400 focus:outline-none resize-y"
                placeholder="Email body (HTML supported)…"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHEMICAL_EMAIL_MERGE_TAGS.map((mt) => (
                  <button
                    key={mt.tag}
                    type="button"
                    title={mt.label}
                    onClick={() => setBodyHtml((b) => b + mt.tag)}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-neutral-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-400"
                  >
                    {mt.tag}
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-2">
              <div className="min-h-[240px] rounded border bg-card p-4 text-sm overflow-auto">
                <SandboxedHtmlPreview html={previewResolve(bodyHtml)} minHeight={208} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !clientEmail || !subject.trim() || !bodyHtml.trim()}>
            {sending ? "Sending…" : `Send to ${clientEmail ?? "client"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
