"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/shared/useConfirm";
import {
  useCommissionStatementLines,
  useCommissionStatements,
  useSetCommissionStatementStatus,
  useVoidCommissionStatement,
} from "@/lib/hooks/use-commissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { CommissionStatement, CommissionStatementStatus } from "@/types/crm-commissions";
import Link from "next/link";
import { EARNED_ON_LABEL, adjustmentServiceLabel, formatRate, negativeClass } from "./commission-format";
import type { CommissionEarnedOn } from "@/types/crm-commissions";

const STATUS_STYLE: Record<CommissionStatementStatus, string> = {
  draft: "border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-muted/40 text-slate-600 dark:text-neutral-400",
  approved: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  paid: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400",
  void: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
};

function StatementDetail({ statement, onClose }: { statement: CommissionStatement; onClose: () => void }) {
  const { data: lines = [] } = useCommissionStatementLines(statement.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{statement.employeeName} · {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Sale</th><th className="px-3 py-2">Earned</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Commission</th></tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => {
                const adj = !!l.sourceEvKey;
                return (
                  <tr key={l.id} className={adj ? "bg-red-50/40 dark:bg-red-950/10" : undefined}>
                    <td className="px-3 py-2">{formatDate(l.eventDate)}</td>
                    <td className="px-3 py-2">
                      {l.invoiceId ? (
                        <Link className="hover:underline" href={`/crm/accounting/invoices/${l.invoiceId}`}>#{l.invoiceNumber ?? "—"}</Link>
                      ) : (
                        <>#{l.invoiceNumber ?? "—"}</>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.clientName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {adj ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">Adjustment</Badge>
                          <span>{adjustmentServiceLabel(l.serviceName)}</span>
                          <span className="text-xs text-muted-foreground">
                            {l.commissionCents < 0 ? `refund/void on invoice #${l.invoiceNumber ?? "—"}` : `reversal on invoice #${l.invoiceNumber ?? "—"}`}
                          </span>
                        </span>
                      ) : (
                        l.serviceName ?? "Unassigned"
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize">{l.saleType ?? "—"}</td>
                    <td className="px-3 py-2">{EARNED_ON_LABEL[(l.earnedOn ?? "paid") as CommissionEarnedOn]}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", negativeClass(l.basisCents))}>{formatCurrency(l.basisCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRate(l.rateBps)}</td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", negativeClass(l.commissionCents))}>{formatCurrency(l.commissionCents)}</td>
                  </tr>
                );
              })}
              {lines.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No lines.</td></tr>}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={6}>Total</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", negativeClass(statement.totalBasisCents))}>{formatCurrency(statement.totalBasisCents)}</td>
                <td />
                <td className={cn("px-3 py-2 text-right tabular-nums", negativeClass(statement.totalCommissionCents))}>{formatCurrency(statement.totalCommissionCents)}</td>
              </tr>
              {statement.totalCommissionCents < 0 && (
                <tr>
                  <td className="px-3 py-2 text-xs text-red-600 dark:text-red-400" colSpan={9}>
                    Net negative: adjustments exceed new earnings on this statement. This is an amount owed back by the rep, to be carried against future pay.
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommissionStatementsTab({ canManage }: { canManage: boolean }) {
  const { data: statements = [], isLoading } = useCommissionStatements();
  const setStatus = useSetCommissionStatementStatus();
  const voidStatement = useVoidCommissionStatement();
  const [confirm, confirmDialog] = useConfirm();
  const [open, setOpen] = useState<CommissionStatement | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Rep</th><th className="px-3 py-2">Period</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Commission</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && statements.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No statements yet. Create one from the Earnings tab.</td></tr>}
            {statements.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-medium">{s.employeeName}</td>
                <td className="px-3 py-2">{formatDate(s.periodStart)} – {formatDate(s.periodEnd)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", negativeClass(s.totalBasisCents))}>{formatCurrency(s.totalBasisCents)}</td>
                <td className={cn("px-3 py-2 text-right font-medium tabular-nums", negativeClass(s.totalCommissionCents))}>
                  {formatCurrency(s.totalCommissionCents)}
                  {s.totalCommissionCents < 0 && <span className="ml-2 text-xs font-normal">owed back</span>}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={cn("border text-xs font-medium capitalize", STATUS_STYLE[s.status])}>{s.status}</Badge>
                  {s.paidAt && <span className="ml-2 text-xs text-muted-foreground">{formatDate(s.paidAt)}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(s)}>View</Button>
                  {canManage && s.status === "draft" && <Button size="sm" variant="ghost" onClick={() => run(() => setStatus.mutateAsync({ id: s.id, status: "approved" }), "Statement approved")}>Approve</Button>}
                  {canManage && s.status === "approved" && <Button size="sm" variant="ghost" onClick={() => run(() => setStatus.mutateAsync({ id: s.id, status: "paid" }), "Marked paid")}>Mark paid</Button>}
                  {canManage && (s.status === "draft" || s.status === "approved") && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                      if (await confirm({ title: "Void this statement?", description: "Its lines go back to unclaimed so they can be put on another statement.", destructive: true, confirmLabel: "Void" })) {
                        await run(() => voidStatement.mutateAsync(s.id), "Statement voided");
                      }
                    }}>Void</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <StatementDetail statement={open} onClose={() => setOpen(null)} />}
      {confirmDialog}
    </div>
  );
}
