"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { useInvoicePDFTemplates } from "@/lib/hooks/use-invoice-pdf-templates";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import { INVOICE_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import { RecipientChipInput } from "@/components/shared/RecipientChipInput";

// Exported so bulk-send flows (InvoicesList's "Email Selected") send the
// same default content a single manual send would, when no org default
// template is configured.
export const DEFAULT_INVOICE_TEMPLATE_BODY = `<p>Hi [clientfirstname],</p>

<p>Please find attached Invoice #[invoicenumber] from [companyname] for [invoicetotal], due [duedate].</p>

<p>If you have any questions, please don't hesitate to reach out.</p>

<p>Thank you,<br>[salesrepname]<br>[companyphonenumber]</p>`;

export const DEFAULT_INVOICE_SUBJECT = "Invoice #[invoicenumber] from [companyname] — [invoicetotal] due [duedate]";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

interface Props {
  invoiceId: string;
  invoiceNumber: number | null;
  totalCents: number;
  balanceCents: number;
  dueDate: string | null;
  clientName: string | null;
  clientEmail: string | null;
  /** The PDF template this invoice is already pinned to (crm_invoices.pdf_template_id),
   *  if any — takes priority over the org default when auto-selecting. */
  pinnedPdfTemplateId?: string | null;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function InvoiceEmailDialog({
  invoiceId, invoiceNumber, totalCents, balanceCents, dueDate, clientName, clientEmail, pinnedPdfTemplateId, open, onClose, onSent,
}: Props) {
  // Email content (subject/body) templates now live in Documents (doc type
  // "invoice_email") — a richer block-based builder than the old plain
  // subject+body records, and the single place all email templates live.
  const { data: allDocTemplates = [] } = useDocumentTemplates();
  const templates = allDocTemplates.filter((t) => t.docType === "invoice_email" && t.status === "active");
  const { data: pdfTemplates = [] } = useInvoicePDFTemplates();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const { data: selectedDocTemplate } = useDocumentTemplate(selectedTemplateId);
  const [pdfTemplateId, setPdfTemplateId] = useState<string>("");
  const [subject, setSubject]   = useState(DEFAULT_INVOICE_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_INVOICE_TEMPLATE_BODY);
  const [includePdf, setIncludePdf] = useState(true);
  const [sending, setSending]   = useState(false);
  const [tab, setTab]           = useState<"compose" | "preview">("compose");
  const [toEmails, setToEmails] = useState<string[]>(clientEmail ? [clientEmail] : []);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const richTextRef = useRef<RichTextEditorHandle>(null);

  // Reset the editable "To" field whenever a different invoice's dialog
  // opens — otherwise a manually-edited address from a prior send would
  // linger since this dialog stays mounted between opens.
  useEffect(() => {
    if (open) setToEmails(clientEmail ? [clientEmail] : []);
  }, [open, clientEmail]);

  // Same issue for template selection: this dialog stays mounted across
  // invoices, and both auto-select effects below only fire once (guarded on
  // "still empty") — without this, invoice A's chosen PDF layout silently
  // carried over as invoice B's, even though B is pinned to something else.
  useEffect(() => {
    setSelectedTemplateId("");
    setPdfTemplateId("");
  }, [invoiceId]);

  // Once the chosen document template's blocks load, fill in subject/body —
  // merge tags are left unresolved ([clientfirstname], etc.) for the send
  // route's own resolver, same as the automation email-step picker.
  useEffect(() => {
    if (!selectedDocTemplate) return;
    if (selectedDocTemplate.subject) setSubject(selectedDocTemplate.subject);
    setBodyHtml(renderBlocksToHtml(selectedDocTemplate.blocks, {}));
    setIncludePdf(selectedDocTemplate.includePdf);
  }, [selectedDocTemplate]);

  // Auto-select the org's default invoice-email document template on open
  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0];
      if (def) setSelectedTemplateId(def.id);
    }
  }, [open, templates, selectedTemplateId]);

  // Default to whatever PDF template this invoice is already pinned to
  // (matches the server's own priority order: explicit choice > invoice's
  // own template > org default) rather than always jumping to the org
  // default/first template regardless of what the invoice was set to.
  useEffect(() => {
    if (open && pdfTemplates.length > 0 && !pdfTemplateId) {
      const pinned = pinnedPdfTemplateId
        ? pdfTemplates.find((t) => t.id === pinnedPdfTemplateId)
        : undefined;
      const def = pinned ?? pdfTemplates.find((t) => t.isDefault) ?? pdfTemplates[0];
      if (def) setPdfTemplateId(def.id);
    }
  }, [open, pdfTemplates, pdfTemplateId, pinnedPdfTemplateId]);

  // Simple preview: replace merge tags with placeholder values for display
  function previewResolve(text: string) {
    return text
      .replace(/\[clientfirstname\]/gi, clientName?.split(" ")[0] ?? "Client")
      .replace(/\[clientlastname\]/gi,  clientName?.split(" ").slice(1).join(" ") ?? "")
      .replace(/\[clientfullname\]/gi,  clientName ?? "Client")
      .replace(/\[companyname\]/gi,     "Your Company")
      .replace(/\[invoicenumber\]/gi,   invoiceNumber != null ? String(invoiceNumber) : "—")
      .replace(/\[invoicedate\]/gi,     new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
      .replace(/\[duedate\]/gi,         fmtDate(dueDate))
      .replace(/\[invoicetotal\]/gi,    formatCurrency(totalCents))
      .replace(/\[balancedue\]/gi,      formatCurrency(balanceCents))
      .replace(/\[salesrepname\]/gi,    "Your Rep")
      .replace(/\[companyphonenumber\]/gi, "(555) 000-0000");
  }

  async function handleSend() {
    if (toEmails.length === 0) {
      toast.error("Enter at least one recipient email address");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/crm/invoices/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, subject, bodyHtml, ccEmails, to: toEmails, includePdf, templateId: pdfTemplateId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send");
      }
      toast.success(`Invoice emailed to ${toEmails.join(", ")}`);
      onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Invoice #{invoiceNumber ?? "—"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <RecipientChipInput
            label="To"
            emails={toEmails}
            onChange={setToEmails}
            placeholder={clientName ? `Add recipients for ${clientName}…` : "Add recipients…"}
          />

          <RecipientChipInput
            label="CC"
            emails={ccEmails}
            onChange={setCcEmails}
            placeholder="Add CC recipients…"
          />

          {/* Email content template picker (Documents → Invoice Email) */}
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

          {/* PDF layout template picker — which invoice PDF template to attach,
              overriding the invoice's pinned template / org default just for this send. */}
          {pdfTemplates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-20 shrink-0 text-xs">PDF Layout</Label>
              <Select value={pdfTemplateId} onValueChange={setPdfTemplateId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose a PDF layout…" />
                </SelectTrigger>
                <SelectContent>
                  {pdfTemplates.map((t) => (
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
              <RichTextEditor
                ref={richTextRef}
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Email body…"
                minHeight={200}
              />
              {/* Merge tag reference */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {INVOICE_EMAIL_MERGE_TAGS.map((mt) => (
                  <button
                    key={mt.tag}
                    type="button"
                    title={mt.label}
                    onClick={() => richTextRef.current?.insertContent(mt.tag)}
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

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <Checkbox checked={includePdf} onCheckedChange={(v) => setIncludePdf(!!v)} />
            <Paperclip className="h-3.5 w-3.5" />
            Attach the invoice PDF to this email
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={sending || toEmails.length === 0 || !subject.trim() || !bodyHtml.trim()}
          >
            {sending ? "Sending…" : `Send to ${toEmails.length > 0 ? toEmails.join(", ") : "client"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
