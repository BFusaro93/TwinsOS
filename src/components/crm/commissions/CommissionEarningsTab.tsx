"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/shared/useConfirm";
import { useCommissionLines, useCommissionPendingAdjustments, useCreateCommissionStatement } from "@/lib/hooks/use-commissions";
import { useEmployees } from "@/lib/hooks/use-employees";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EARNED_ON_LABEL, adjustmentServiceLabel, formatRate, negativeClass, quarterBounds, yearBounds } from "./commission-format";

type Preset = "this_q" | "last_q" | "this_y" | "custom";

export function CommissionEarningsTab({ canManage }: { canManage: boolean }) {
  const { today } = useOrgDates();
  const [preset, setPreset] = useState<Preset>("last_q");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [employeeId, setEmployeeId] = useState("all");
  const { data: employees = [] } = useEmployees(false);
  const [confirm, confirmDialog] = useConfirm();
  const createStatement = useCreateCommissionStatement();

  const range = useMemo(() => {
    const t = today();
    if (preset === "this_q") return quarterBounds(t);
    if (preset === "last_q") return quarterBounds(t, -1);
    if (preset === "this_y") return yearBounds(t);
    return custom;
  }, [preset, custom, today]);

  const { data: lines = [], isLoading, error } = useCommissionLines(range.from, range.to, employeeId === "all" ? undefined : employeeId);

  // Clawbacks/offsets for refunds and voids since the last statement. Not tied to the
  // selected period: the next statement for a rep carries them whatever it covers.
  const { data: allAdjustments = [] } = useCommissionPendingAdjustments();
  const adjustments = useMemo(
    () => (employeeId === "all" ? allAdjustments : allAdjustments.filter((a) => a.employeeId === employeeId)),
    [allAdjustments, employeeId],
  );

  const byEmployee = useMemo(() => {
    const m = new Map<string, { id: string; name: string; basis: number; commission: number; unclaimed: number; unclaimedCommission: number; adjCount: number; adjCommission: number }>();
    for (const l of lines) {
      const e = m.get(l.employeeId) ?? { id: l.employeeId, name: l.employeeName, basis: 0, commission: 0, unclaimed: 0, unclaimedCommission: 0, adjCount: 0, adjCommission: 0 };
      e.basis += l.basisCents;
      e.commission += l.commissionCents;
      if (!l.statementId) { e.unclaimed += 1; e.unclaimedCommission += l.commissionCents; }
      m.set(l.employeeId, e);
    }
    // Reps with only pending adjustments (nothing earned in this period) still get a card.
    for (const a of adjustments) {
      const name = employees.find((x) => x.id === a.employeeId);
      const e = m.get(a.employeeId) ?? {
        id: a.employeeId, name: name ? `${name.firstName} ${name.lastName}` : "—",
        basis: 0, commission: 0, unclaimed: 0, unclaimedCommission: 0, adjCount: 0, adjCommission: 0,
      };
      e.adjCount += 1;
      e.adjCommission += a.commissionCents;
      m.set(a.employeeId, e);
    }
    return [...m.values()];
  }, [lines, adjustments, employees]);

  async function makeStatement(e: { id: string; name: string; unclaimedCommission: number; adjCount: number; adjCommission: number }) {
    const net = e.unclaimedCommission + e.adjCommission;
    if (!(await confirm({
      title: `Create statement for ${e.name}?`,
      description: (
        <span className="space-y-1">
          <span className="block">
            Locks {formatCurrency(e.unclaimedCommission)} of unclaimed commission for {formatDate(range.from)} – {formatDate(range.to)}. Lines already on another statement are skipped.
          </span>
          {e.adjCount > 0 && (
            <span className="block">
              Also includes {e.adjCount} adjustment line{e.adjCount === 1 ? "" : "s"} totaling {formatCurrency(e.adjCommission)} for refunds/voids since the last statement.
            </span>
          )}
          {e.adjCount > 0 && (
            <span className={cn("block font-medium", negativeClass(net))}>
              Net statement total: {formatCurrency(net)}{net < 0 ? " (amount owed back by the rep)" : ""}
            </span>
          )}
        </span>
      ),
      confirmLabel: "Create statement",
    }))) return;
    try {
      await createStatement.mutateAsync({ employeeId: e.id, from: range.from, to: range.to });
      toast.success("Statement created — see the Statements tab");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create statement");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="last_q">Last quarter</SelectItem>
            <SelectItem value="this_q">This quarter</SelectItem>
            <SelectItem value="this_y">This year</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <>
            <Input type="date" className="w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <Input type="date" className="w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </>
        )}
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All reps" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
        {range.from && range.to && <span className="text-sm text-muted-foreground">{formatDate(range.from)} – {formatDate(range.to)}</span>}
      </div>

      {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Could not load earnings"}</p>}

      {lines.some((l) => !l.serviceName) && (
        <p className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Some invoice lines in this period have no service, so they can only earn under an &quot;All services&quot; rule. Open the invoice and pick a service on each line to fix it.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byEmployee.map((e) => (
          <div key={e.id} className="rounded-lg border p-4">
            <p className="font-medium">{e.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(e.commission)}</p>
            <p className="text-xs text-muted-foreground">on {formatCurrency(e.basis)} pre-tax revenue</p>
            {e.adjCount > 0 && (
              <p className={cn("mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300")}>
                Includes <span className={cn("font-medium", negativeClass(e.adjCommission))}>{formatCurrency(e.adjCommission)}</span> in adjustments for refunds/voids since the last statement ({e.adjCount} line{e.adjCount === 1 ? "" : "s"}).
              </p>
            )}
            {(e.unclaimed > 0 || e.adjCount > 0) && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {formatCurrency(e.unclaimedCommission + e.adjCommission)} not yet on a statement
                  {e.unclaimedCommission + e.adjCommission < 0 && " (owed back)"}
                </span>
                {canManage && <Button size="sm" variant="outline" onClick={() => makeStatement(e)} disabled={createStatement.isPending}>Create statement</Button>}
              </div>
            )}
          </div>
        ))}
        {!isLoading && byEmployee.length === 0 && (
          <p className="col-span-full rounded-md border p-6 text-center text-sm text-muted-foreground">
            No commissionable activity in this period. Reps need a plan assigned (Plans &amp; Assignments) and sales-rep set on their invoices, jobs, contracts or clients.
          </p>
        )}
      </div>

      {adjustments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Pending adjustments</h2>
          <p className="text-xs text-muted-foreground">
            Refunds, voids and edits on invoices already paid out on a statement. These go on the rep&apos;s next statement, whatever period it covers.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Rep</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {adjustments.map((a) => (
                  <tr key={a.clawEvKey + a.employeeId}>
                    <td className="px-3 py-2">{employees.find((x) => x.id === a.employeeId)?.firstName ?? "—"} {employees.find((x) => x.id === a.employeeId)?.lastName ?? ""}</td>
                    <td className="px-3 py-2">
                      {a.invoiceId ? <Link className="hover:underline" href={`/crm/accounting/invoices/${a.invoiceId}`}>#{a.invoiceNumber ?? "—"}</Link> : <>#{a.invoiceNumber ?? "—"}</>}
                    </td>
                    <td className="px-3 py-2">{a.clientName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="mr-2 border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">Adjustment</Badge>
                      {adjustmentServiceLabel(a.serviceName)}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", negativeClass(a.basisCents))}>{formatCurrency(a.basisCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRate(a.rateBps)}</td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", negativeClass(a.commissionCents))}>{formatCurrency(a.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Rep</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Client</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Sale</th><th className="px-3 py-2">Earned</th>
                <th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Commission</th><th className="px-3 py-2">Statement</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.evKey + l.employeeId}>
                  <td className="px-3 py-2">{l.employeeName}</td>
                  <td className="px-3 py-2">{formatDate(l.eventDate)}</td>
                  <td className="px-3 py-2"><Link className="hover:underline" href={`/crm/accounting/invoices/${l.invoiceId}`}>#{l.invoiceNumber ?? "—"}</Link></td>
                  <td className="px-3 py-2">{l.clientName ?? "—"}</td>
                  <td className="px-3 py-2">{l.serviceName ?? <span className="text-amber-700 dark:text-amber-400">Unassigned</span>}</td>
                  <td className="px-3 py-2 capitalize">{l.saleType}</td>
                  <td className="px-3 py-2">{EARNED_ON_LABEL[l.earnedOn]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.basisCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRate(l.rateBps)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(l.commissionCents)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.statementId ? "On statement" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
