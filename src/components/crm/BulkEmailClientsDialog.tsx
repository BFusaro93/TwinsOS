"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const MERGE_TAG_HINT = "[clientfirstname] [clientfullname] [companyname] [companyphonenumber] [accountbalance]";

type Recipient = { id: string; name: string; email: string | null };

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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  useEffect(() => {
    if (!open || clientIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, display_name, primary_email" as any)
        .in("id", clientIds)
        .is("deleted_at", null);
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      setRecipients(
        rows.map((r) => ({ id: r.id as string, name: r.display_name as string, email: (r.primary_email as string | null) ?? null }))
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, clientIds]);

  const withEmail = recipients.filter((r) => !!r.email);
  const withoutEmail = recipients.filter((r) => !r.email);

  function handleOpenChange(o: boolean) {
    if (!o) {
      onClose();
      setSubject("");
      setBody("");
      setRecipients([]);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    if (withEmail.length === 0) {
      toast.error("None of the selected clients have an email on file");
      return;
    }
    setSending(true);
    try {
      const bodyHtml = body
        .split("\n\n")
        .map((para) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#0f172a">${para.replace(/\n/g, "<br>")}</p>`)
        .join("");
      const results = await Promise.allSettled(
        withEmail.map((r) =>
          fetch(`/api/crm/clients/${r.id}/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, bodyHtml }),
          }).then(async (res) => {
            if (!res.ok) {
              const json = await res.json().catch(() => ({}));
              throw new Error(json.error ?? "Failed to send");
            }
          })
        )
      );
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
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line…" />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={7}
            />
            <p className="text-[11px] text-slate-400">Merge tags: {MERGE_TAG_HINT}</p>
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
