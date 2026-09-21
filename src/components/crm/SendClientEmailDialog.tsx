"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUserStore } from "@/stores/current-user-store";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
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
  const { currentUser } = useCurrentUserStore();
  const { data: orgSettings } = useOrgSettings();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  // Who the client reaches when they hit Reply. The request carries this
  // choice as a mode; the route resolves the actual mailbox from the session
  // and the org row, so nothing here can point replies somewhere else.
  const [replyToMode, setReplyToMode] = useState<"company" | "user">("company");
  const orgReplyTo = orgSettings?.replyToEmail ?? null;
  const userReplyTo = currentUser.email || null;

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
        body: JSON.stringify({ subject, bodyHtml, replyTo: replyToMode }),
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
            <Label>Replies go to</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReplyToMode("company")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-left text-xs ${
                  replyToMode === "company"
                    ? "border-brand-500 bg-brand-50 text-slate-900"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <span className="block font-medium">Company</span>
                <span className="block truncate text-[11px] text-slate-400">
                  {orgReplyTo ?? "Not set — replies go nowhere"}
                </span>
              </button>
              <button
                type="button"
                disabled={!userReplyTo}
                onClick={() => setReplyToMode("user")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-left text-xs disabled:opacity-50 ${
                  replyToMode === "user"
                    ? "border-brand-500 bg-brand-50 text-slate-900"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <span className="block font-medium">Me</span>
                <span className="block truncate text-[11px] text-slate-400">
                  {userReplyTo ?? "No address on your login"}
                </span>
              </button>
            </div>
            {replyToMode === "company" && !orgReplyTo && (
              <p className="text-[11px] text-amber-600">
                No company reply-to address is set — a reply to this email won&rsquo;t reach
                anyone. Set one in Settings → Organization.
              </p>
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
          <Button onClick={handleSend} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
