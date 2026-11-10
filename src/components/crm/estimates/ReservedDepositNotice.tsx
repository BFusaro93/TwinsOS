"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useEstimateReservedDeposits, useReleaseEstimateDeposit } from "@/lib/hooks/use-estimates";

/**
 * A proposal deposit is reserved for its estimate: it only pays invoices of
 * this estimate's job / project / contract. When the estimate is lost the
 * money is stranded there, so staff are prompted to refund it or release it to
 * the client's general credit. On any other stage it's a quiet note.
 */
export function ReservedDepositNotice({
  estimateId,
  stage,
  canRelease,
}: {
  estimateId: string;
  stage: string;
  canRelease: boolean;
}) {
  const { data: deposits = [] } = useEstimateReservedDeposits(estimateId);
  const release = useReleaseEstimateDeposit();
  const reservedCents = deposits.reduce((s, d) => s + d.unusedCents, 0);
  if (reservedCents <= 0) return null;

  async function releaseAll() {
    try {
      for (const d of deposits) await release.mutateAsync(d.id);
      toast.success("Deposit released to the client's general credit");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't release the deposit");
    }
  }

  if (stage !== "lost") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-300"
        title="This deposit is held as the client's credit, reserved for this estimate's invoices (its job, project or contract). It is applied to those invoices automatically and can't pay other work until it is released."
      >
        {formatCurrency(reservedCents)} reserved for this estimate
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-900 dark:text-red-200 shrink-0">
      <p className="font-medium">
        This estimate is lost, but {formatCurrency(reservedCents)} of the client&apos;s deposit is still reserved for it.
      </p>
      <p className="mt-1">
        Refund it from{" "}
        <Link href="/crm/accounting/payments" className="underline underline-offset-2">
          Accounting → Payments
        </Link>
        , or release it to the client&apos;s general credit so it can pay their other invoices.
      </p>
      {canRelease && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 text-xs"
          disabled={release.isPending}
          onClick={releaseAll}
        >
          Release to general credit
        </Button>
      )}
    </div>
  );
}
