"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";

// The statement is dated on the org's calendar — toISOString() is the UTC
// date, which rolls over to tomorrow at 8pm ET.
function startOfYearISO(todayYmd: string): string {
  return `${todayYmd.slice(0, 4)}-01-01`;
}

interface Props {
  clientId: string;
  clientName: string | null;
  clientEmail: string | null;
  open: boolean;
  onClose: () => void;
}

/** "Client > More > Account Statement" — generates a running-balance
 *  account statement PDF (mail-in style), modeled after the org's existing
 *  Service Autopilot statement report screen: a date range, a few
 *  show/hide toggles, an optional message, and a live preview. */
export function AccountStatementDialog({ clientId, clientName, clientEmail, open, onClose }: Props) {
  const orgTimeZone = useOrgTimeZone();
  const [statementDate, setStatementDate] = useState(() => todayInZone(orgTimeZone));
  const [periodFrom, setPeriodFrom] = useState(() => startOfYearISO(todayInZone(orgTimeZone)));
  const [periodTo, setPeriodTo] = useState(() => todayInZone(orgTimeZone));
  const [showLineItemDetails, setShowLineItemDetails] = useState(true);
  const [minBalance, setMinBalance] = useState("");
  const [message, setMessage] = useState("");
  const [emailTo, setEmailTo] = useState(clientEmail ?? "");
  const [sending, setSending] = useState(false);

  const pdfUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: statementDate,
      from: periodFrom,
      to: periodTo,
      detail: showLineItemDetails ? "1" : "0",
    });
    if (message.trim()) params.set("message", message.trim());
    if (minBalance.trim() && !Number.isNaN(Number(minBalance))) {
      params.set("minBalanceCents", String(Math.round(Number(minBalance) * 100)));
    }
    return `/api/crm/clients/${clientId}/statement/pdf?${params.toString()}`;
  }, [clientId, statementDate, periodFrom, periodTo, message, minBalance, showLineItemDetails]);

  useEffect(() => {
    if (open) setEmailTo(clientEmail ?? "");
  }, [open, clientEmail]);

  async function sendEmail() {
    if (!emailTo.trim()) {
      toast.error("Enter a recipient email address");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}/statement/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [emailTo.trim()],
          statementDate,
          periodFrom,
          periodTo,
          message: message.trim() || undefined,
          detail: showLineItemDetails,
          minBalanceCents: minBalance.trim() && !Number.isNaN(Number(minBalance))
            ? Math.round(Number(minBalance) * 100)
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send statement");
        return;
      }
      if (data.skipped) {
        toast.info("Not sent — balance is below the minimum threshold");
        return;
      }
      toast.success("Statement emailed");
    } catch {
      toast.error("Failed to send statement");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Account Statement{clientName ? ` — ${clientName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Statement Date</Label>
              <Input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Period From</Label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Period To</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Checkbox checked={showLineItemDetails} onCheckedChange={(v) => setShowLineItemDetails(v === true)} />
              Show invoice/payment activity detail
            </label>

            <div>
              <Label className="text-xs">Don&apos;t generate if balance is less than</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 0.00"
                value={minBalance}
                onChange={(e) => setMinBalance(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Statement Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="e.g. Thank you for your business! Please remit payment by the due date."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div>
              <Label className="text-xs">Email To</Label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="client@example.com"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="mt-2 h-7 w-full text-xs"
                onClick={() => void sendEmail()}
                disabled={sending}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {sending ? "Sending…" : "Email Statement"}
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Preview</span>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline"
              >
                <Printer className="h-3.5 w-3.5" />
                Open / Print
              </a>
            </div>
            <div className="min-h-[420px] flex-1 overflow-hidden rounded-md border bg-slate-50">
              {/* key forces a reload when params change so the preview stays in sync */}
              <iframe key={pdfUrl} src={pdfUrl} title="Statement preview" className="h-[420px] w-full" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
