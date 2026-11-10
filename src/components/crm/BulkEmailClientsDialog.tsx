"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { blocksUseEstimateTags } from "@/lib/estimates/estimate-tags";
import { renderBlocksToHtml } from "@/lib/utils/document-template-renderer";
import { GENERAL_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import Link from "next/link";
import { toast } from "sonner";
import { chunk } from "@/lib/utils/chunk";

type EmailPurpose = "marketing" | "service";

type Recipient = {
  id: string;
  name: string;
  email: string | null;
  doNotMarket: boolean;
  /** Per-client "OK to Email = No" — the send route refuses marketing mail to these (422), so the dialog must skip them up front rather than report a confusing "failed". */
  notOkToEmail: boolean;
  /** Hard bounce — a dead address, not a preference. Blocks BOTH purposes. */
  emailBouncedAt: string | null;
  /** Another account with this same address is Do Not Market — opt-outs are per address. */
  addressOptedOut: boolean;
};

// This is a one-to-many commercial send, so it is throttled the same way the
// campaign sender is (src/lib/campaigns/send-campaign.ts): 5 concurrent sends
// then a short pause, which keeps us under Resend's default 2 req/sec. Firing
// one fetch per recipient at once used to rate-limit itself the moment anyone
// selected more than a handful of clients.
const SEND_CONCURRENCY = 5;
const BATCH_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function BulkEmailClientsDialog({
  open,
  onClose,
  clientIds,
}: {
  open: boolean;
  onClose: () => void;
  clientIds: string[];
}) {
  const qc = useQueryClient();
  // Email content templates live in Documents (doc type "client") — the same
  // block-based builder used for invoice-email templates — rather than the
  // old plain subject+body records, so all email templates live in one place.
  const { data: allDocTemplates = [] } = useDocumentTemplates();
  const templates = useMemo(
    () => allDocTemplates.filter((t) => t.docType === "client" && t.status === "active"),
    [allDocTemplates]
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  // Auto-picked defaults that turned out to be estimate emails (estimate-only merge tags would
  // send blank here); skipped by the auto-select below. A user's own pick is never skipped.
  const [skippedDefaultIds, setSkippedDefaultIds] = useState<string[]>([]);
  const autoPickedRef = useRef(false);
  const { data: selectedDocTemplate } = useDocumentTemplate(selectedTemplateId);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  // Defaults to the restrictive option: a sender has to consciously declare a
  // message a service notice before opted-out clients are included.
  const [purpose, setPurpose] = useState<EmailPurpose>("marketing");
  // Clients already emailed by this dialog. After a run with failures the
  // dialog stays open; these are left out of the next Send so pressing it again
  // ("Retry failed") never re-mails anyone who already got the message.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; name: string; error: string }[]>([]);
  const richTextRef = useRef<RichTextEditorHandle>(null);

  function applyTemplate(templateId: string) {
    autoPickedRef.current = false;
    setSelectedTemplateId(templateId);
  }

  // Once the chosen document template's blocks load, fill in subject/body —
  // merge tags are left unresolved for the send route's own resolver, same
  // as InvoiceEmailDialog.
  useEffect(() => {
    if (!selectedDocTemplate) return;
    if (autoPickedRef.current && blocksUseEstimateTags(selectedDocTemplate.blocks)) {
      setSkippedDefaultIds((prev) => [...prev, selectedDocTemplate.id]);
      setSelectedTemplateId("");
      return;
    }
    if (selectedDocTemplate.subject) setSubject(selectedDocTemplate.subject);
    setBodyHtml(renderBlocksToHtml(selectedDocTemplate.blocks, {}, { preserveUnresolvedKnownTags: true }));
  }, [selectedDocTemplate]);

  // Auto-select the org's default "client" document template on open.
  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const candidates = templates.filter((t) => !skippedDefaultIds.includes(t.id));
      const def = candidates.find((t) => t.isDefault) ?? candidates[0];
      if (def) {
        autoPickedRef.current = true;
        setSelectedTemplateId(def.id);
      }
    }
  }, [open, templates, selectedTemplateId, skippedDefaultIds]);

  // The caller builds `clientIds` inline, so it's a new array on every parent
  // render — keying the fetch off its identity re-ran the query continuously
  // while the dialog was open. Key off the contents instead.
  const clientIdsKey = clientIds.join(",");

  useEffect(() => {
    const ids = clientIdsKey ? clientIdsKey.split(",") : [];
    if (!open || ids.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setSentIds(new Set());
    setFailures([]);
    (async () => {
      const supabase = createClient();
      // In chunks: a select-all on the board or waiting list puts hundreds of ids in the URL,
      // which the gateway refused — and the ignored error showed the dialog with no recipients.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      for (const part of chunk(ids)) {
        const { data, error } = await supabase
          .from("clients")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, display_name, primary_email, do_not_market, ok_to_email, email_bounced_at" as any)
          .in("id", part)
          .is("deleted_at", null);
        if (cancelled) return;
        if (error) {
          toast.error("Couldn't load the selected clients. Try again.");
          setRecipients([]);
          setLoading(false);
          return;
        }
        rows.push(...(data ?? []));
      }
      // Opt-outs are per address: an address another (unselected) account opted
      // out with is skipped for marketing too. The send route enforces it; this
      // shows it up front. Best effort — a lookup failure just leaves the route to refuse.
      const optedOutAddresses = new Set<string>();
      const emails = rows.map((r) => r.primary_email as string | null).filter((e): e is string => !!e);
      if (emails.length > 0) {
        const { data: orgId } = await supabase.rpc("my_org_id");
        if (orgId) {
          for (const part of chunk(emails, 500)) {
            const { data: suppressed } = await supabase.rpc("crm_marketing_suppressed_emails", { p_org_id: orgId as string, p_emails: part });
            for (const e of (suppressed ?? []) as string[]) optedOutAddresses.add(e);
          }
        }
        if (cancelled) return;
      }
      setRecipients(
        rows.map((r) => ({
          id: r.id as string,
          name: r.display_name as string,
          email: (r.primary_email as string | null) ?? null,
          doNotMarket: (r.do_not_market as boolean | null) ?? false,
          notOkToEmail: r.ok_to_email === false,
          emailBouncedAt: (r.email_bounced_at as string | null) ?? null,
          addressOptedOut: !!r.primary_email && optedOutAddresses.has(String(r.primary_email).trim().toLowerCase()),
        }))
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, clientIdsKey]);

  // Three different reasons a selected client may not get the email, and they
  // are NOT interchangeable:
  //
  //   no address  — nothing to send to.
  //   bounced     — the address hard-bounced. A deliverability fact, so it
  //                 blocks both purposes; re-sending hurts domain reputation.
  //   opted out   — a marketing preference. Blocks commercial mail only; a
  //                 service notice about already-contracted work may still go
  //                 (CAN-SPAM exempts transactional/relationship mail).
  //
  // The send route enforces all three itself — this just tells the sender up
  // front who is being left out and why, per the purpose they picked.
  const withoutEmail = useMemo(() => recipients.filter((r) => !r.email), [recipients]);
  const bounced = useMemo(
    () => recipients.filter((r) => !!r.email && !!r.emailBouncedAt),
    [recipients]
  );
  const optedOut = useMemo(
    () => recipients.filter((r) => !!r.email && !r.emailBouncedAt && (r.doNotMarket || r.notOkToEmail || r.addressOptedOut)),
    [recipients]
  );
  // One copy per address (case-insensitive): accounts sharing a mailbox — a second
  // property, a property manager — used to get the same email once per account.
  // The first selected account supplies the merge tags.
  const { withEmail, sharedAddress } = useMemo(() => {
    const eligible = recipients.filter(
      (r) =>
        !!r.email &&
        !r.emailBouncedAt &&
        (purpose === "service" || (!r.doNotMarket && !r.notOkToEmail && !r.addressOptedOut))
    );
    const seen = new Set<string>();
    const unique: Recipient[] = [];
    const shared: Recipient[] = [];
    for (const r of eligible) {
      const key = r.email!.trim().toLowerCase();
      if (seen.has(key)) shared.push(r);
      else { seen.add(key); unique.push(r); }
    }
    // An address already emailed in this dialog is done — the next Send only
    // goes to the ones that failed (or were never attempted).
    return { withEmail: unique.filter((r) => !sentIds.has(r.id)), sharedAddress: shared };
  }, [recipients, purpose, sentIds]);

  function handleOpenChange(o: boolean) {
    if (!o) {
      onClose();
      setSelectedTemplateId("");
      setSubject("");
      setBodyHtml("");
      setRecipients([]);
      setPurpose("marketing");
      setSentIds(new Set());
      setFailures([]);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    if (withEmail.length === 0) {
      toast.error(
        purpose === "service"
          ? "None of the selected clients can be emailed (no address on file, or the address has bounced)"
          : "None of the selected clients can be emailed (no address on file, bounced, or opted out of marketing)"
      );
      return;
    }
    setSending(true);
    try {
      const batchTargets = withEmail;
      const sendOne = async (r: Recipient) => {
        // A 429 (provider rate limit) is retried after a short pause rather
        // than reported as a failure.
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch(`/api/crm/clients/${r.id}/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, bodyHtml, bulk: true, purpose }),
          });
          if (res.ok) return;
          if (res.status === 429 && attempt < 2) {
            await sleep(1000 * (attempt + 1));
            continue;
          }
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? "Failed to send");
        }
      };
      const results: PromiseSettledResult<void>[] = [];
      for (let i = 0; i < batchTargets.length; i += SEND_CONCURRENCY) {
        const batch = batchTargets.slice(i, i + SEND_CONCURRENCY);
        results.push(...await Promise.allSettled(batch.map(sendOne)));
        if (i + SEND_CONCURRENCY < batchTargets.length) await sleep(BATCH_DELAY_MS);
      }
      const newlySent = batchTargets.filter((_, idx) => results[idx]?.status === "fulfilled");
      const newFailures = batchTargets.flatMap((r, idx) => {
        const res = results[idx];
        return res && res.status === "rejected"
          ? [{ id: r.id, name: r.name, error: res.reason instanceof Error ? res.reason.message : "Failed to send" }]
          : [];
      });
      const succeeded = newlySent.length;
      const failed = newFailures.length;
      if (succeeded > 0) {
        toast.success(`Sent to ${succeeded} client${succeeded === 1 ? "" : "s"}`);
        setSentIds((prev) => new Set([...prev, ...newlySent.map((r) => r.id)]));
      }
      setFailures(newFailures);
      if (failed > 0) {
        toast.error(`Failed to send to ${failed} client${failed === 1 ? "" : "s"} — see the dialog; Retry only re-sends those`);
      }
      batchTargets.forEach((r) => qc.invalidateQueries({ queryKey: ["clients", r.id, "activity"] }));
      if (failed === 0) handleOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {clientIds.length} Client{clientIds.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>To</Label>
            {loading ? (
              <p className="text-xs text-slate-400 dark:text-neutral-500">Loading recipients…</p>
            ) : (
              <>
                <p className="text-xs text-slate-600 dark:text-neutral-400">
                  {withEmail.length} recipient{withEmail.length === 1 ? "" : "s"} will receive this email
                  {withEmail.length > 0 && `: ${withEmail.map((r) => r.name).join(", ")}`}
                </p>
                {sharedAddress.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {sharedAddress.length} share an email address with another selected client — one copy per address: {sharedAddress.map((r) => r.name).join(", ")}
                  </p>
                )}
                {sentIds.size > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {sentIds.size} already sent — they won&apos;t be emailed again.
                  </p>
                )}
                {failures.length > 0 && (
                  <div className="max-h-28 space-y-0.5 overflow-auto rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-2 py-1.5 text-xs text-red-700 dark:text-red-400">
                    {failures.map((f) => (
                      <p key={f.id}>{f.name}: {f.error}</p>
                    ))}
                  </div>
                )}
                {withoutEmail.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {withoutEmail.length} skipped (no email on file): {withoutEmail.map((r) => r.name).join(", ")}
                  </p>
                )}
                {bounced.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {bounced.length} skipped (email bounced): {bounced.map((r) => r.name).join(", ")}
                  </p>
                )}
                {purpose === "marketing" && optedOut.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {optedOut.length} skipped (Do Not Market / Not OK to Email / address opted out on another account): {optedOut.map((r) => r.name).join(", ")}
                  </p>
                )}
                {purpose === "service" && optedOut.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Includes {optedOut.length} client{optedOut.length === 1 ? "" : "s"} who opted out of
                    marketing — allowed for a service notice.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as EmailPurpose)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="marketing">Marketing / promotional</SelectItem>
                <SelectItem value="service">Service notice (about their scheduled work)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              {purpose === "marketing"
                ? "Skips clients marked Do Not Market and adds an unsubscribe footer."
                : "Reaches clients who opted out of marketing, with no unsubscribe footer — only for notices about work they have already contracted. Bounced addresses are still skipped."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            {templates.length > 0 ? (
              <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a template… (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-slate-400 dark:text-neutral-500">
                No templates yet —{" "}
                <Link href="/crm/settings/documents" className="text-brand-600 dark:text-brand-400 hover:underline" target="_blank">
                  create one in Documents with type &quot;Client&quot;
                </Link>
                , or just write a one-off message below.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line…" />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <RichTextEditor
              ref={richTextRef}
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message…"
              minHeight={160}
            />
            <p className="pt-1.5 text-[11px] text-slate-400 dark:text-neutral-500">Click a tag to insert it into the message at your cursor:</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {GENERAL_EMAIL_MERGE_TAGS.map((mt) => (
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loading || withEmail.length === 0}>
            {sending
              ? "Sending…"
              : sentIds.size > 0 || failures.length > 0
                ? `Retry failed (${withEmail.length})`
                : `Send${withEmail.length > 0 ? ` (${withEmail.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
