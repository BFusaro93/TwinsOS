"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import type { CRMInvoice } from "@/types/crm-invoices";

interface Props {
  invoices: CRMInvoice[];
  onClose: () => void;
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function MergeInvoicesDialog({ invoices, onClose }: Props) {
  const qc = useQueryClient();
  const [parentId, setParentId] = useState<string>(invoices[0]?.id ?? "");
  const [merging, setMerging] = useState(false);

  // Validate same client
  const clientIds = new Set(invoices.map((i) => i.clientId));
  const sameClient = clientIds.size === 1;

  // A locked invoice (printed/sent — see InvoiceDetail.tsx's lock toggle) is
  // meant to be immutable. Merging would rewrite a locked parent's totals or
  // void out a locked child, silently bypassing that protection — block it
  // here and let the server enforce the same rule.
  const lockedInvoices = invoices.filter((i) => i.locked);
  const hasLocked = lockedInvoices.length > 0;

  const parent = invoices.find((i) => i.id === parentId);
  const children = invoices.filter((i) => i.id !== parentId);
  const mergedTotal = invoices.reduce((s, i) => s + i.totalCents, 0);

  async function handleMerge() {
    if (!parentId || children.length === 0 || hasLocked) return;
    setMerging(true);
    try {
      const res = await fetch("/api/crm/invoices/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, childIds: children.map((c) => c.id) }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Merge failed");
      await qc.refetchQueries({ queryKey: ["crm-invoices"] });
      toast.success("Invoices merged successfully");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4" />
            Merge Invoices
          </DialogTitle>
        </DialogHeader>

        {!sameClient ? (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Selected invoices belong to different clients. Merging is only allowed for invoices from the same client.
          </div>
        ) : hasLocked ? (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Invoice{lockedInvoices.length > 1 ? "s" : ""} #{lockedInvoices.map((i) => i.invoiceNumber).join(", #")} {lockedInvoices.length > 1 ? "are" : "is"} locked.
            Unlock {lockedInvoices.length > 1 ? "them" : "it"} before merging — a locked invoice can&apos;t have its totals rewritten or be voided out.
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Select which invoice to keep as the parent. It will retain its invoice number and date.
              The other invoice{children.length > 1 ? "s" : ""} will be voided after their line items are moved.
            </p>

            {/* Client name */}
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Client: {invoices[0]?.clientName}
            </div>

            {/* Invoice selector */}
            <div className="space-y-2">
              {invoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => setParentId(inv.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    parentId === inv.id
                      ? "border-green-500 bg-green-50 ring-1 ring-green-500"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        parentId === inv.id ? "border-green-500" : "border-slate-300"
                      }`}>
                        {parentId === inv.id && (
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">
                          Invoice #{inv.invoiceNumber}
                        </span>
                        {parentId === inv.id && (
                          <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            PARENT
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      {formatCurrency(inv.totalCents)}
                    </span>
                  </div>
                  <div className="mt-1 pl-7 text-xs text-slate-500">
                    {formatDate(inv.invoiceDate)} · {(inv.lineItems ?? []).length} line item{(inv.lineItems ?? []).length !== 1 ? "s" : ""}
                    {(inv.lineItems ?? []).length > 0 && (
                      <span className="ml-1 text-slate-400">
                        ({(inv.lineItems ?? []).map((li) => li.description).join(", ")})
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Summary */}
            {parent && (
              <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Merged into Invoice #{parent.invoiceNumber}</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(mergedTotal)}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {invoices.reduce((s, i) => s + (i.lineItems ?? []).length, 0)} total line items ·{" "}
                  Invoice date: {formatDate(parent.invoiceDate)}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merging}>Cancel</Button>
          {sameClient && !hasLocked && (
            <Button onClick={handleMerge} disabled={merging || !parentId}>
              {merging ? "Merging…" : "Merge Invoices"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
