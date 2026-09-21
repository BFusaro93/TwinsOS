"use client";

import { useMemo, useState } from "react";
import { useClients } from "@/lib/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";
import { Send, Eye } from "lucide-react";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearISO(): string {
  return `${new Date().getFullYear()}-01-01`;
}

type SendStatus = "sent" | "skipped" | "failed";

/** "Statements" accounting page — runs account statements for many clients
 *  at once (SA's "Statement Report" screen supported a customer picker with
 *  an "all customers" option; this is that, scoped to clients with a
 *  balance since that's who a statement run is actually for). */
export function StatementsList() {
  const { can } = usePermissions();
  const { data: clients = [], isLoading } = useClients();

  const [statementDate, setStatementDate] = useState(todayISO());
  const [periodFrom, setPeriodFrom] = useState(startOfYearISO());
  const [periodTo, setPeriodTo] = useState(todayISO());
  const [showLineItemDetails, setShowLineItemDetails] = useState(true);
  const [minBalance, setMinBalance] = useState("0.00");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, SendStatus>>({});

  const clientsWithBalance = useMemo(
    () =>
      clients
        .filter((c) => c.status === "active" && c.balanceOutstandingCents > 0)
        .sort((a, b) => b.balanceOutstandingCents - a.balanceOutstandingCents),
    [clients]
  );

  const allSelected = clientsWithBalance.length > 0 && selectedIds.size === clientsWithBalance.length;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(clientsWithBalance.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function previewUrl(clientId: string): string {
    const params = new URLSearchParams({
      date: statementDate,
      from: periodFrom,
      to: periodTo,
      detail: showLineItemDetails ? "1" : "0",
    });
    if (message.trim()) params.set("message", message.trim());
    return `/api/crm/clients/${clientId}/statement/pdf?${params.toString()}`;
  }

  async function sendSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSending(true);
    setResults({});
    try {
      const minBalanceCents = minBalance.trim() && !Number.isNaN(Number(minBalance))
        ? Math.round(Number(minBalance) * 100)
        : undefined;

      const settled = await Promise.allSettled(
        ids.map(async (clientId) => {
          const res = await fetch(`/api/crm/clients/${clientId}/statement/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              statementDate,
              periodFrom,
              periodTo,
              message: message.trim() || undefined,
              detail: showLineItemDetails,
              minBalanceCents,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Failed to send");
          return { clientId, skipped: !!data.skipped };
        })
      );

      const nextResults: Record<string, SendStatus> = {};
      let sentCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      settled.forEach((r, i) => {
        const clientId = ids[i];
        if (r.status === "fulfilled") {
          nextResults[clientId] = r.value.skipped ? "skipped" : "sent";
          if (r.value.skipped) skippedCount++; else sentCount++;
        } else {
          nextResults[clientId] = "failed";
          failedCount++;
        }
      });
      setResults(nextResults);

      if (sentCount > 0) toast.success(`Emailed ${sentCount} statement${sentCount !== 1 ? "s" : ""}`);
      if (skippedCount > 0) toast.info(`Skipped ${skippedCount} — below the minimum balance`);
      if (failedCount > 0) toast.error(`Failed to send ${failedCount} — check they have an email on file`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-white px-4 py-3">
        <h1 className="text-sm font-semibold text-slate-800">Account Statements</h1>
        <p className="text-xs text-slate-400">
          Run and email account statements for clients with an outstanding balance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 border-b bg-slate-50 px-4 py-3 md:grid-cols-5">
        <div>
          <Label className="text-xs">Statement Date</Label>
          <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Period From</Label>
          <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Period To</Label>
          <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Min. Balance to Include</Label>
          <Input type="number" step="0.01" value={minBalance} onChange={(e) => setMinBalance(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Checkbox checked={showLineItemDetails} onCheckedChange={(v) => setShowLineItemDetails(v === true)} />
            Show activity detail
          </label>
        </div>
        <div className="md:col-span-5">
          <Label className="text-xs">Statement Message</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="e.g. Thank you for your business! Please remit payment by the due date."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b bg-white px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          Select all ({clientsWithBalance.length} with a balance)
        </label>
        {can("acct_send_statements") && (
          <Button size="sm" className="h-7 text-xs" disabled={selectedIds.size === 0 || sending} onClick={() => void sendSelected()}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {sending ? "Sending…" : `Email Selected (${selectedIds.size})`}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <p className="p-4 text-xs text-slate-400">Loading clients…</p>}
        {!isLoading && clientsWithBalance.length === 0 && (
          <p className="p-4 text-xs text-slate-400">No active clients currently have an outstanding balance.</p>
        )}
        <table className="w-full text-xs">
          <tbody className="divide-y">
            {clientsWithBalance.map((c) => {
              const status = results[c.id];
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="w-8 px-4 py-2">
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-800">{c.displayName}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {c.primaryEmail ?? <span className="text-red-500">No email on file</span>}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-800">
                    {formatCurrency(c.balanceOutstandingCents)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {status === "sent" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Sent</Badge>}
                    {status === "skipped" && <Badge variant="outline">Skipped</Badge>}
                    {status === "failed" && <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Failed</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <a
                      href={previewUrl(c.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
