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
import { EARNED_ON_LABEL, formatRate } from "./commission-format";
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
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">{formatDate(l.eventDate)}</td>
                  <td className="px-3 py-2">#{l.invoiceNumber ?? "—"}</td>
                  <td className="px-3 py-2">{l.clientName ?? "—"}</td>
                  <td className="px-3 py-2">{l.serviceName ?? "Unassigned"}</td>
                  <td className="px-3 py-2 capitalize">{l.saleType ?? "—"}</td>
                  <td className="px-3 py-2">{EARNED_ON_LABEL[(l.earnedOn ?? "paid") as CommissionEarnedOn]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.basisCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRate(l.rateBps)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(l.commissionCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={6}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(statement.totalBasisCents)}</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(statement.totalCommissionCents)}</td>
              </tr>
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
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(s.totalBasisCents)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(s.totalCommissionCents)}</td>
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
