"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import { CHEMICAL_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import { KIND_DEFAULTS } from "./SendApplicationNoticeDialog";

export interface BulkChemicalVisit {
  id: string;
  clientName?: string | null;
}

type Eligibility = "ready" | "sent" | "no_email" | "bounced" | "no_application";

const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  ready: "Ready to send",
  sent: "Already sent",
  no_email: "No email on file",
  bounced: "Email bounced",
  no_application: "No confirmed application",
};

const CHUNK = 150;
const CONCURRENCY = 4;

interface Props {
  open: boolean;
  onClose: () => void;
  visits: BulkChemicalVisit[];
  /** Label for the dialog description, e.g. the board date. */
  dateLabel?: string;
}

/** Sends the Client Instruction (Notice of Treatment) email for many visits at once — each
 *  goes through the same per-visit route as a single send, a few at a time. */
export function BulkSendChemicalNoticesDialog({ open, onClose, visits, dateLabel }: Props) {
  const queryClient = useQueryClient();
  const visitIds = useMemo(() => visits.map((v) => v.id), [visits]);

  const { data: eligibility, isLoading } = useQuery({
    queryKey: ["chemical-bulk-eligibility", visitIds],
    enabled: open && visitIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const out = new Map<string, Eligibility>();
      const chunks: string[][] = [];
      for (let i = 0; i < visitIds.length; i += CHUNK) chunks.push(visitIds.slice(i, i + CHUNK));
      const clients = new Map<string, { email: string | null; bounced: string | null }>();
      const usable = new Set<string>();
      const sent = new Set<string>();
      for (const ids of chunks) {
        const [vRes, aRes, eRes] = await Promise.all([
          supabase.from("crm_job_visits").select("id, clients(primary_email, email_bounced_at)").in("id", ids),
          supabase.from("crm_chemical_applications").select("visit_id, used, preloaded, confirmed_at").in("visit_id", ids).is("deleted_at", null),
          supabase.from("crm_chemical_application_emails").select("visit_id").in("visit_id", ids).eq("email_type", "chemical_application"),
        ]);
        if (vRes.error) throw vRes.error;
        if (aRes.error) throw aRes.error;
        if (eRes.error) throw eRes.error;
        for (const v of vRes.data ?? []) {
          clients.set(v.id, { email: v.clients?.primary_email ?? null, bounced: v.clients?.email_bounced_at ?? null });
        }
        for (const a of aRes.data ?? []) {
          // The notice only reports what was actually applied: used, and confirmed if it was a planned preload.
          if (a.visit_id && a.used && (!a.preloaded || a.confirmed_at)) usable.add(a.visit_id);
        }
        for (const e of eRes.data ?? []) if (e.visit_id) sent.add(e.visit_id);
      }
      for (const id of visitIds) {
        const c = clients.get(id);
        out.set(
          id,
          !usable.has(id) ? "no_application"
            : !c?.email ? "no_email"
            : c.bounced ? "bounced"
            : sent.has(id) ? "sent"
            : "ready"
        );
      }
      return out;
    },
  });

  const { data: allDocTemplates = [] } = useDocumentTemplates();
  const templates = allDocTemplates.filter((t) => t.docType === "chemical" && t.status === "active");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const { data: selectedDocTemplate } = useDocumentTemplate(selectedTemplateId);
  const [subject, setSubject] = useState(KIND_DEFAULTS.chemical.subject);
  const [bodyHtml, setBodyHtml] = useState(KIND_DEFAULTS.chemical.body);
  const [attachPdf, setAttachPdf] = useState(true);
  const [includeSent, setIncludeSent] = useState(false);

  useEffect(() => {
    if (!selectedDocTemplate) return;
    if (selectedDocTemplate.subject) setSubject(selectedDocTemplate.subject);
    setBodyHtml(renderBlocksToHtml(selectedDocTemplate.blocks, {}, { preserveUnresolvedKnownTags: true }));
  }, [selectedDocTemplate]);

  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0];
      if (def) setSelectedTemplateId(def.id);
    }
  }, [open, templates, selectedTemplateId]);

  const counts = useMemo(() => {
    const c: Record<Eligibility, number> = { ready: 0, sent: 0, no_email: 0, bounced: 0, no_application: 0 };
    for (const id of visitIds) c[eligibility?.get(id) ?? "no_application"]++;
    return c;
  }, [eligibility, visitIds]);

  const targets = useMemo(
    () => visits.filter((v) => {
      const e = eligibility?.get(v.id);
      return e === "ready" || (includeSent && e === "sent");
    }),
    [visits, eligibility, includeSent]
  );

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<{ id: string; name: string; error: string }[]>([]);
  const [finished, setFinished] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (open) {
      setRunning(false);
      setFinished(false);
      setFailures([]);
      setProgress({ done: 0, total: 0 });
      cancelRef.current = false;
    }
  }, [open]);

  async function sendAll() {
    const queue = [...targets];
    const total = queue.length;
    if (total === 0) return;
    setRunning(true);
    setFinished(false);
    setFailures([]);
    setProgress({ done: 0, total });
    cancelRef.current = false;
    let done = 0;
    let ok = 0;
    const failed: { id: string; name: string; error: string }[] = [];

    async function worker() {
      while (queue.length > 0 && !cancelRef.current) {
        const v = queue.shift()!;
        try {
          const res = await fetch(`/api/crm/chemical-applications/${v.id}/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, bodyHtml, kind: "chemical", attachPdf }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `Send failed (${res.status})`);
          }
          ok++;
        } catch (err) {
          failed.push({ id: v.id, name: v.clientName ?? "Unknown client", error: err instanceof Error ? err.message : "Send failed" });
        }
        done++;
        setProgress({ done, total });
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

    setFailures(failed);
    setRunning(false);
    setFinished(true);
    queryClient.invalidateQueries({ queryKey: ["chemical-bulk-eligibility"] });
    if (failed.length === 0) toast.success(`Sent ${ok} notice${ok === 1 ? "" : "s"}`);
    else toast.warning(`Sent ${ok}, ${failed.length} failed`);
  }

  const canSend = !running && targets.length > 0 && !!subject.trim() && !!bodyHtml.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Notices of Treatment{dateLabel ? ` — ${dateLabel}` : ""}</DialogTitle>
          <DialogDescription>
            Emails each client the record of what was applied at their property — one email per visit,
            using the details recorded for that visit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="rounded-md border bg-slate-50 dark:bg-muted/40 px-3 py-2 text-xs">
            {isLoading ? (
              <span className="text-muted-foreground">Checking {visits.length} visits…</span>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
                {(Object.keys(ELIGIBILITY_LABEL) as Eligibility[]).map((k) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className={k === "ready" ? "font-semibold text-slate-800 dark:text-neutral-100" : "text-muted-foreground"}>{ELIGIBILITY_LABEL[k]}</span>
                    <span className="tabular-nums">{counts[k]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {counts.sent > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
              <input type="checkbox" checked={includeSent} onChange={(e) => setIncludeSent(e.target.checked)} disabled={running} />
              Also re-send to the {counts.sent} visit{counts.sent === 1 ? "" : "s"} already sent
            </label>
          )}

          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-20 shrink-0 text-xs">Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={running}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a template…" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
            <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} disabled={running} />
            Attach the Notice of Treatment as a PDF
          </label>

          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-xs" disabled={running} />
          </div>

          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={9}
            disabled={running}
            className="w-full rounded border border-border p-2 text-xs font-mono focus:border-brand-400 focus:outline-none resize-y"
            placeholder="Email body (HTML supported)…"
          />
          <div className="flex flex-wrap gap-1.5">
            {CHEMICAL_EMAIL_MERGE_TAGS.map((mt) => (
              <button
                key={mt.tag}
                type="button"
                title={mt.label}
                disabled={running}
                onClick={() => setBodyHtml((b) => b + mt.tag)}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-neutral-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-400"
              >
                {mt.tag}
              </button>
            ))}
          </div>

          {(running || finished) && (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {running ? `Sending… ${progress.done} of ${progress.total}` : `Done — ${progress.total - failures.length} sent, ${failures.length} failed`}
              </p>
              {failures.length > 0 && (
                <ul className="max-h-32 overflow-y-auto rounded border bg-card p-2 text-xs text-red-700 dark:text-red-400">
                  {failures.map((f) => (
                    <li key={f.id}><span className="font-medium">{f.name}</span> — {f.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Stop after current</Button>
          ) : (
            <Button variant="outline" onClick={onClose}>{finished ? "Close" : "Cancel"}</Button>
          )}
          <Button onClick={sendAll} disabled={!canSend}>
            {running ? "Sending…" : finished ? `Send ${targets.length} more` : `Send ${targets.length} notice${targets.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
