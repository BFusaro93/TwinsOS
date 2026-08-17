"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useContracts } from "@/lib/hooks/use-contracts";
import { useUpdateJob } from "@/lib/hooks/use-crm-jobs";
import { formatCurrency } from "@/lib/utils";

/** "Monthly Flat Rate" snow billing has no billing engine of its own — it
 *  rides the same recurring-invoice cron that bills Contracts (daily,
 *  idempotent per billing month). A job stays silently unbilled until it's
 *  linked to an active, auto-generating contract, so this makes that link
 *  (and its absence) explicit instead of the job just never invoicing. */
export function SnowMonthlyBillingLink({
  jobId,
  clientId,
  contractId,
}: {
  jobId: string;
  clientId: string;
  contractId: string | null;
}) {
  const { data: contracts = [] } = useContracts(clientId);
  const updateJob = useUpdateJob();

  const linkedContract = contracts.find((c) => c.id === contractId);
  const missingOrInactive = !linkedContract || !linkedContract.isActive || !linkedContract.autoGenerate;

  async function handleLink(value: string) {
    try {
      await updateJob.mutateAsync({ id: jobId, patch: { contract_id: value === "none" ? null : value } });
      toast.success(value === "none" ? "Unlinked from contract" : "Linked to contract");
    } catch {
      toast.error("Failed to update linked contract");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <Label className="text-xs text-slate-500">Billing Contract (required for Monthly Flat Rate)</Label>
      <Select value={contractId ?? "none"} onValueChange={handleLink}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Link a contract…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not linked</SelectItem>
          {contracts.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title} — {formatCurrency(c.monthlyAmountCents)}/mo{c.isActive && c.autoGenerate ? "" : " (inactive)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {missingOrInactive ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {contractId
            ? "The linked contract is inactive or has auto-generate off — this job will not be billed automatically."
            : "This job has no linked contract, so it will never be billed. Monthly Flat Rate billing runs entirely through Contracts (Accounting → Contracts), not this job screen."}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">
          Billed automatically via this contract on day {linkedContract.billingDayOfMonth} of each month.
        </p>
      )}
    </div>
  );
}
