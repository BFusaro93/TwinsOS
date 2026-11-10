"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useSmsReadiness, SMS_NOT_READY_MESSAGE } from "@/lib/hooks/use-sms-readiness";
import { smsSegmentInfo } from "@/lib/sms/segments";

const MERGE_TAG_HINT = "[clientfirstname] [clientfullname] [companyname]";

/** Twilio's hard ceiling per message — the route rejects anything longer. */
const MAX_SMS_LENGTH = 1600;

export function SendClientSmsDialog({
  open,
  onClose,
  clientId,
  clientName,
  clientPhone,
  smsOptIn,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientPhone: string;
  /** clients.sms_opt_in — the route enforces this too; this is the UI's half. */
  smsOptIn: boolean;
}) {
  const qc = useQueryClient();
  const { data: smsReady } = useSmsReadiness(open);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      onClose();
      setBody("");
    }
  };

  async function handleSend() {
    if (!body.trim()) {
      toast.error("Message is required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send text");
      toast.success(`Text sent to ${clientPhone}`);
      qc.invalidateQueries({ queryKey: ["clients", clientId, "activity"] });
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send text");
    } finally {
      setSending(false);
    }
  }

  const length = body.length;
  // Segments are what carriers bill and what the SMS add-on's usage counts.
  // GSM-7 holds 160 characters (153 once split); an emoji or curly quote
  // switches the whole text to UCS-2 — 70 (67 once split). Merge tags are
  // filled in after this count, so a long name can add a segment.
  const { segments, encoding } = smsSegmentInfo(body);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Text {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {smsReady === false && (
            <p className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {SMS_NOT_READY_MESSAGE}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={clientPhone} disabled className="text-muted-foreground" />
          </div>
          {!smsOptIn ? (
            <p className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {clientName} has not opted in to text messages. Check
              &ldquo;Opted in to text messages&rdquo; on the client record — after they have
              confirmed consent — before texting them.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_SMS_LENGTH))}
                placeholder="Write your message…"
                rows={5}
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-neutral-500">
                <span>Merge tags: {MERGE_TAG_HINT}</span>
                <span className={length > MAX_SMS_LENGTH - 100 ? "text-amber-600 dark:text-amber-400" : undefined}>
                  {length}/{MAX_SMS_LENGTH} · {segments} segment{segments === 1 ? "" : "s"}
                  {encoding === "UCS-2" && length > 0 && (
                    <span title="An emoji or special character makes every segment hold 70 characters instead of 160"> (emoji/special characters)</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            {smsOptIn ? "Cancel" : "Close"}
          </Button>
          {smsOptIn && (
            <Button onClick={handleSend} disabled={sending || !body.trim()}>
              {sending ? "Sending…" : "Send"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
