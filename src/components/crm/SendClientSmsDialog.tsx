"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const MERGE_TAG_HINT = "[clientfirstname] [clientfullname] [companyname]";

/** Twilio's hard ceiling per message — the route rejects anything longer. */
const MAX_SMS_LENGTH = 1600;

/**
 * Segments a carrier will bill for. A single GSM-7 message holds 160
 * characters; once it has to be split, each part gives up 7 characters to the
 * concatenation header, leaving 153. Deliberately approximate — a body with
 * emoji or curly quotes encodes as UCS-2 and splits far sooner — so this is
 * shown as guidance, never used to block a send.
 */
function segmentCount(length: number): number {
  if (length === 0) return 0;
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

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
  const segments = segmentCount(length);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Text {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={clientPhone} disabled className="text-slate-500" />
          </div>
          {!smsOptIn ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Merge tags: {MERGE_TAG_HINT}</span>
                <span className={length > MAX_SMS_LENGTH - 100 ? "text-amber-600" : undefined}>
                  {length}/{MAX_SMS_LENGTH} · {segments} segment{segments === 1 ? "" : "s"}
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
