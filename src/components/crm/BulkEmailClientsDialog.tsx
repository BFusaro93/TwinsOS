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
import { useEmailTemplates } from "@/lib/hooks/use-email-templates";
import { GENERAL_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import Link from "next/link";
import { toast } from "sonner";

type Recipient = { id: string; name: string; email: string | null; doNotMarket: boolean };

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
  const { data: templates = [] } = useEmailTemplates("general");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const richTextRef = useRef<RichTextEditorHandle>(null);

  // Picking a template fills the fields once, from the click — deliberately not
  // an effect keyed on `templates`, which is a fresh array identity on every
  // refetch and so re-applied the template over whatever the user had since
  // typed into the subject/body.
  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) { setSubject(tpl.subject); setBodyHtml(tpl.bodyHtml); }
  }

  // The caller builds `clientIds` inline, so it's a new array on every parent
  // render — keying the fetch off its identity re-ran the query continuously
  // while the dialog was open. Key off the contents instead.
  const clientIdsKey = clientIds.join(",");

  useEffect(() => {
    const ids = clientIdsKey ? clientIdsKey.split(",") : [];
    if (!open || ids.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, display_name, primary_email, do_not_market" as any)
        .in("id", ids)
        .is("deleted_at", null);
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      setRecipients(
        rows.map((r) => ({
          id: r.id as string,
          name: r.display_name as string,
          email: (r.primary_email as string | null) ?? null,
          doNotMarket: (r.do_not_market as boolean | null) ?? false,
        }))
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, clientIdsKey]);

  // A selection blast is commercial mail, so Do Not Market applies here the
  // same as it does to a campaign — the send route enforces it too, this just
  // tells the sender up front who is being left out and why.
  const withEmail = useMemo(() => recipients.filter((r) => !!r.email && !r.doNotMarket), [recipients]);
  const withoutEmail = useMemo(() => recipients.filter((r) => !r.email), [recipients]);
  const optedOut = useMemo(() => recipients.filter((r) => !!r.email && r.doNotMarket), [recipients]);

  function handleOpenChange(o: boolean) {
    if (!o) {
      onClose();
      setSelectedTemplateId("");
      setSubject("");
      setBodyHtml("");
      setRecipients([]);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    if (withEmail.length === 0) {
      toast.error("None of the selected clients can be emailed (no address on file, or opted out of marketing)");
      return;
    }
    setSending(true);
    try {
      const results: PromiseSettledResult<void>[] = [];
      for (let i = 0; i < withEmail.length; i += SEND_CONCURRENCY) {
        const batch = withEmail.slice(i, i + SEND_CONCURRENCY);
        results.push(...await Promise.allSettled(
          batch.map((r) =>
            fetch(`/api/crm/clients/${r.id}/send-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subject, bodyHtml, bulk: true }),
            }).then(async (res) => {
              if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error ?? "Failed to send");
              }
            })
          )
        ));
        if (i + SEND_CONCURRENCY < withEmail.length) await sleep(BATCH_DELAY_MS);
      }
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      if (succeeded > 0) {
        toast.success(`Sent to ${succeeded} client${succeeded === 1 ? "" : "s"}`);
      }
      if (failed > 0) {
        toast.error(`Failed to send to ${failed} client${failed === 1 ? "" : "s"}`);
      }
      withEmail.forEach((r) => qc.invalidateQueries({ queryKey: ["clients", r.id, "activity"] }));
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
              <p className="text-xs text-slate-400">Loading recipients…</p>
            ) : (
              <>
                <p className="text-xs text-slate-600">
                  {withEmail.length} recipient{withEmail.length === 1 ? "" : "s"} will receive this email
                  {withEmail.length > 0 && `: ${withEmail.map((r) => r.name).join(", ")}`}
                </p>
                {withoutEmail.length > 0 && (
                  <p className="text-xs text-amber-600">
                    {withoutEmail.length} skipped (no email on file): {withoutEmail.map((r) => r.name).join(", ")}
                  </p>
                )}
                {optedOut.length > 0 && (
                  <p className="text-xs text-amber-600">
                    {optedOut.length} skipped (Do Not Market): {optedOut.map((r) => r.name).join(", ")}
                  </p>
                )}
              </>
            )}
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
              <p className="text-xs text-slate-400">
                No templates yet —{" "}
                <Link href="/crm/settings?tab=crm" className="text-brand-600 hover:underline" target="_blank">
                  create one in Settings → Clients → Email Templates
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
            <p className="pt-1.5 text-[11px] text-slate-400">Click a tag to insert it into the message at your cursor:</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {GENERAL_EMAIL_MERGE_TAGS.map((mt) => (
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loading || withEmail.length === 0}>
            {sending ? "Sending…" : `Send${withEmail.length > 0 ? ` (${withEmail.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
