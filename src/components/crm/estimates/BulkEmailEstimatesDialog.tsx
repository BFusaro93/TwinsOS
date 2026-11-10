"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { documentLacksEstimateLink } from "@/lib/estimates/confirmation-settings";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import { EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import { DEFAULT_SUBJECT, DEFAULT_TEMPLATE_BODY } from "./SendEstimateDialog";

export interface BulkEmailEstimateTarget {
  id: string;
  estimateNumber: number | null;
  clientName: string | null;
}

interface Props {
  /** The selected estimates that are still shown in the list when the dialog opens. */
  estimates: BulkEmailEstimateTarget[];
  open: boolean;
  onClose: () => void;
  /** Called after a run that sent at least one email (to refresh the list). */
  onSent: () => void;
}

type SendResult = { ok: true } | { ok: false; error: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function label(e: BulkEmailEstimateTarget) {
  const num = e.estimateNumber != null ? `#${e.estimateNumber}` : "(no number)";
  return e.clientName ? `${num} — ${e.clientName}` : num;
}

/** Same template/subject/body choices as the single-estimate Send dialog,
 *  applied to every selected estimate — each still goes to that estimate's own
 *  client, with its own proposal link and merge tags resolved server-side.
 *
 *  Sends one at a time (retrying a 429): firing them all at once tripped the
 *  mail provider's ~2 requests/second limit and failed most of the batch. A run
 *  with failures keeps the dialog open, lists each failure with the server's
 *  reason, and "Retry failed" only re-sends those — an estimate already emailed
 *  in this dialog is never emailed again. */
export function BulkEmailEstimatesDialog({ estimates, open, onClose, onSent }: Props) {
  const { data: allDocTemplates = [] } = useDocumentTemplates();
  // Estimate emails are client-type documents (estimate-type documents are
  // proposal layouts), same list the single Send dialog offers.
  const templates = useMemo(
    () => allDocTemplates.filter((t) => t.docType === "client" && t.status === "active"),
    [allDocTemplates]
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const { data: selectedDocTemplate } = useDocumentTemplate(selectedTemplateId);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_TEMPLATE_BODY);
  const [includePdf, setIncludePdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, SendResult>>({});
  const richTextRef = useRef<RichTextEditorHandle>(null);

  // Fresh state per open, so a previous batch's edits and results don't linger.
  useEffect(() => {
    if (open) {
      setSelectedTemplateId("");
      setSubject(DEFAULT_SUBJECT);
      setBodyHtml(DEFAULT_TEMPLATE_BODY);
      setIncludePdf(true);
      setResults({});
      setProgress(0);
    }
  }, [open]);

  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0];
      if (def) setSelectedTemplateId(def.id);
    }
  }, [open, templates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedDocTemplate) return;
    if (selectedDocTemplate.subject) setSubject(selectedDocTemplate.subject);
    setBodyHtml(renderBlocksToHtml(selectedDocTemplate.blocks, {}, { preserveUnresolvedKnownTags: true }));
    setIncludePdf(selectedDocTemplate.includePdf);
  }, [selectedDocTemplate]);

  const sentIds = useMemo(
    () => new Set(Object.entries(results).filter(([, r]) => r.ok).map(([id]) => id)),
    [results]
  );
  const failures = useMemo(
    () =>
      estimates
        .map((e) => ({ e, r: results[e.id] }))
        .filter((x): x is { e: BulkEmailEstimateTarget; r: { ok: false; error: string } } => !!x.r && !x.r.ok),
    [estimates, results]
  );
  // Never re-send one that already went out in this dialog.
  const toSend = estimates.filter((e) => !sentIds.has(e.id));
  const isRetry = sentIds.size > 0 || failures.length > 0;

  async function sendOne(estimateId: string): Promise<SendResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`/api/crm/estimates/${estimateId}/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, bodyHtml, expiresInDays: 30, includePdf }),
        });
      } catch {
        return { ok: false, error: "Network error — not sent" };
      }
      if (res.ok) return { ok: true };
      if (res.status === 429 && attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? `Failed to send (HTTP ${res.status})` };
    }
    return { ok: false, error: "Email sending limit reached — try again shortly" };
  }

  async function handleSend() {
    if (toSend.length === 0) return;
    setSending(true);
    setProgress(0);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const e of toSend) {
        const r = await sendOne(e.id);
        if (r.ok) okCount++; else failCount++;
        setResults((prev) => ({ ...prev, [e.id]: r }));
        setProgress((p) => p + 1);
      }
    } finally {
      setSending(false);
    }
    if (okCount > 0) {
      toast.success(`Emailed ${okCount} estimate${okCount !== 1 ? "s" : ""}`);
      onSent();
    }
    if (failCount === 0) {
      onClose();
    } else {
      toast.error(`${failCount} estimate${failCount !== 1 ? "s" : ""} could not be emailed — see the list in the dialog`);
    }
  }

  const sendLabel = sending
    ? `Sending ${progress} of ${toSend.length}…`
    : isRetry
      ? `Retry failed (${toSend.length})`
      : `Send ${toSend.length} Estimate${toSend.length === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email {estimates.length} Estimate{estimates.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            Each estimate is sent to its own client&apos;s email on file with its own proposal link,
            using the subject/body below. Estimates awaiting or denied approval are refused by the server.
          </p>

          {sentIds.size > 0 && (
            <p className="text-xs text-green-700 dark:text-green-400">
              {sentIds.size} already emailed — they won&apos;t be sent again.
            </p>
          )}
          {failures.length > 0 && (
            <div className="max-h-32 space-y-0.5 overflow-auto rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <p className="font-medium">Not sent:</p>
              {failures.map(({ e, r }) => (
                <p key={e.id}>{label(e)}: {r.error}</p>
              ))}
            </div>
          )}

          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-20 shrink-0 text-xs">Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={sending}>
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

          {selectedDocTemplate && documentLacksEstimateLink(selectedDocTemplate.blocks) && (
            <p className="ml-[calc(5rem+0.75rem)] text-xs text-amber-600 dark:text-amber-400">
              This template has no [estimatelink] tag, so clients won&apos;t get a link to accept the proposal.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-xs"
              disabled={sending}
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
              {EMAIL_MERGE_TAGS.map((mt) => (
                <button
                  key={mt.tag}
                  type="button"
                  title={mt.label}
                  onClick={() => richTextRef.current?.insertContent(mt.tag)}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-neutral-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-400"
                >
                  {mt.tag}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={includePdf} onCheckedChange={(v) => setIncludePdf(!!v)} disabled={sending} />
            <Paperclip className="h-3.5 w-3.5" />
            Attach each estimate&apos;s PDF to its email
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {isRetry ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={sending || toSend.length === 0 || !subject.trim() || !bodyHtml.trim()}
          >
            {sendLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
