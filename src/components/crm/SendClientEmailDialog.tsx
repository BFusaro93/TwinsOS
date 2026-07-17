"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const MERGE_TAG_HINT = "[clientfirstname] [clientfullname] [companyname] [companyphonenumber] [accountbalance]";

export function SendClientEmailDialog({
  open,
  onClose,
  clientId,
  clientName,
  clientEmail,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientEmail: string;
}) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      onClose();
      setSubject("");
      setBody("");
    }
  };

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSending(true);
    try {
      const bodyHtml = body
        .split("\n\n")
        .map((para) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#0f172a">${para.replace(/\n/g, "<br>")}</p>`)
        .join("");
      const res = await fetch(`/api/crm/clients/${clientId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send email");
      toast.success(`Email sent to ${clientEmail}`);
      qc.invalidateQueries({ queryKey: ["clients", clientId, "activity"] });
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={clientEmail} disabled className="text-slate-500" />
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
          <Button onClick={handleSend} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
