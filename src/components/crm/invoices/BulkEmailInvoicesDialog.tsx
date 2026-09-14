"use client";

import { useEffect, useRef, useState } from "react";
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
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { useInvoicePDFTemplates } from "@/lib/hooks/use-invoice-pdf-templates";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import { INVOICE_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import { DEFAULT_INVOICE_SUBJECT, DEFAULT_INVOICE_TEMPLATE_BODY } from "./InvoiceEmailDialog";

interface Props {
  invoiceIds: string[];
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

/** Same template/subject/body/PDF-layout choices as the single-invoice send
 *  dialog, applied to every selected invoice — each still goes out to that
 *  invoice's own client, with its own invoice number/total/due date merge
 *  tags resolved server-side per send. */
export function BulkEmailInvoicesDialog({ invoiceIds, open, onClose, onSent }: Props) {
  const { data: allDocTemplates = [] } = useDocumentTemplates();
  const templates = allDocTemplates.filter((t) => t.docType === "invoice_email" && t.status === "active");
  const { data: pdfTemplates = [] } = useInvoicePDFTemplates();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const { data: selectedDocTemplate } = useDocumentTemplate(selectedTemplateId);
  const [pdfTemplateId, setPdfTemplateId] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_INVOICE_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_INVOICE_TEMPLATE_BODY);
  const [includePdf, setIncludePdf] = useState(true);
  const [sending, setSending] = useState(false);
  const richTextRef = useRef<RichTextEditorHandle>(null);

  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0];
      if (def) setSelectedTemplateId(def.id);
    }
  }, [open, templates, selectedTemplateId]);

  useEffect(() => {
    if (open && pdfTemplates.length > 0 && !pdfTemplateId) {
      const def = pdfTemplates.find((t) => t.isDefault) ?? pdfTemplates[0];
      if (def) setPdfTemplateId(def.id);
    }
  }, [open, pdfTemplates, pdfTemplateId]);

  useEffect(() => {
    if (!selectedDocTemplate) return;
    if (selectedDocTemplate.subject) setSubject(selectedDocTemplate.subject);
    setBodyHtml(renderBlocksToHtml(selectedDocTemplate.blocks, {}));
    setIncludePdf(selectedDocTemplate.includePdf);
  }, [selectedDocTemplate]);

  // Reset per-dialog-open so a previous batch's edits don't linger.
  useEffect(() => {
    if (open) {
      setSelectedTemplateId("");
      setPdfTemplateId("");
    }
  }, [open]);

  async function handleSend() {
    setSending(true);
    try {
      const results = await Promise.allSettled(
        invoiceIds.map((invoiceId) =>
          fetch("/api/crm/invoices/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoiceId,
              subject,
              bodyHtml,
              includePdf,
              templateId: pdfTemplateId || undefined,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? "Failed to email invoice");
            }
          })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded > 0) toast.success(`Emailed ${succeeded} invoice${succeeded !== 1 ? "s" : ""}`);
      if (failed > 0) toast.error(`Failed to email ${failed} invoice${failed !== 1 ? "s" : ""} — check they have a client email on file`);
      onSent();
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email {invoiceIds.length} Invoice{invoiceIds.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-slate-500">
            Each invoice is sent to its own client&apos;s email on file, using the subject/body below.
          </p>

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

          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div>
            <RichTextEditor
              ref={richTextRef}
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Email body…"
              minHeight={180}
            />
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
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <Checkbox checked={includePdf} onCheckedChange={(v) => setIncludePdf(!!v)} />
            <Paperclip className="h-3.5 w-3.5" />
            Attach each invoice&apos;s PDF to its email
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSend()} disabled={sending || !subject.trim() || !bodyHtml.trim()}>
            {sending ? "Sending…" : `Send ${invoiceIds.length} Invoice${invoiceIds.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
