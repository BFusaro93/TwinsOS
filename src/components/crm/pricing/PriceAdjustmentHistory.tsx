"use client";

import { Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { ROUNDING_LABELS } from "@/lib/pricing/adjust";
import { TARGET_LABELS } from "@/types/crm-pricing";
import {
  usePriceAdjustments,
  useRevertPriceAdjustment,
} from "@/lib/hooks/use-bulk-pricing";
import { toast } from "sonner";

function signedCurrency(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(cents))}`;
}

function describe(method: string, amount: number): string {
  if (method === "percent") {
    return `${amount > 0 ? "+" : ""}${amount}%`;
  }
  return `${amount > 0 ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
}

export function PriceAdjustmentHistory() {
  const { data: runs = [], isLoading } = usePriceAdjustments();
  const revert = useRevertPriceAdjustment();

  function handleRevert(id: string, name: string, lineCount: number) {
    if (
      !confirm(
        `Undo "${name}"?\n\n` +
          `This restores the original price on up to ${lineCount} line${lineCount !== 1 ? "s" : ""}. ` +
          `Lines you have re-priced by hand since the run are left as they are.`
      )
    ) {
      return;
    }
    revert.mutate(id, {
      onSuccess: ({ reverted, skipped }) => {
        // The skip count is the whole point of surfacing this: it means a
        // later manual decision was preserved rather than clobbered.
        if (skipped > 0) {
          toast.warning(
            `Undone — ${reverted} line${reverted !== 1 ? "s" : ""} restored, ` +
              `${skipped} left alone because ${skipped === 1 ? "it was" : "they were"} changed since the run.`,
            { duration: 10000 }
          );
        } else {
          toast.success(`Undone — ${reverted} line${reverted !== 1 ? "s" : ""} restored.`);
        }
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to undo the run"),
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-white p-6 text-sm text-slate-400 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading run history…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        No price adjustments have been run yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 text-left">Run</th>
            <th className="px-4 py-3 text-left">Change</th>
            <th className="px-4 py-3 text-left">Applied to</th>
            <th className="px-4 py-3 text-right">Lines</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3 text-left">When</th>
            <th className="px-4 py-3 text-center">Status</th>
            <th className="px-4 py-3 text-center w-24">Undo</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{r.name}</p>
                {r.notes && <p className="text-xs text-slate-400">{r.notes}</p>}
              </td>
              <td className="px-4 py-3 tabular-nums text-slate-600">
                {describe(r.method, r.amount)}
                <span className="ml-1.5 text-xs text-slate-400">
                  {ROUNDING_LABELS[r.rounding]}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {r.targets.map((t) => TARGET_LABELS[t]).join(", ")}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{r.lineCount}</td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${
                  r.deltaCents > 0 ? "text-emerald-600" : r.deltaCents < 0 ? "text-red-600" : ""
                }`}
              >
                {signedCurrency(r.deltaCents)}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {new Date(r.appliedAt).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </td>
              <td className="px-4 py-3 text-center">
                <Badge
                  variant={r.status === "reverted" ? "secondary" : "default"}
                  className="text-[10px]"
                >
                  {r.status === "reverted" ? "Reverted" : "Applied"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-center">
                {r.status === "applied" && (
                  <button
                    onClick={() => handleRevert(r.id, r.name, r.lineCount)}
                    disabled={revert.isPending}
                    className="rounded p-1 hover:bg-slate-100 disabled:opacity-40"
                    title="Undo this run"
                  >
                    <Undo2 className="h-4 w-4 text-slate-400" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
