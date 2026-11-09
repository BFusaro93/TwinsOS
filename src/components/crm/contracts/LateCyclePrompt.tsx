"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useGenerateContractInvoices, useUpdateContract } from "@/lib/hooks/use-contracts";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZoneAsLocalMidnight } from "@/lib/time/zone";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";
import { pendingLateCycle, type LateCycle, type LateCycleContractRow } from "@/lib/contract-billing";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function shortDate(ymd: string): string {
  const { y, m, d } = parts(ymd);
  return `${SHORT[m - 1]} ${d}, ${y}`;
}

/** "January", "the Jan – Mar quarter", "the year starting Apr 1, 2027", "the week of Jan 3, 2027". */
function cycleLabel(frequency: LateCycle["frequency"], start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  if (frequency === "monthly") return MONTHS[s.m - 1];
  if (frequency === "quarterly") return `the ${SHORT[s.m - 1]} – ${SHORT[e.m - 1]} quarter`;
  if (frequency === "annual") return `the year starting ${shortDate(start)}`;
  return `the ${frequency === "biweekly" ? "two weeks" : "week"} of ${shortDate(start)}`;
}

function nextLabel(cycle: LateCycle): string {
  if (cycle.frequency === "monthly") return MONTHS[parts(cycle.nextCycleStart).m - 1];
  return `the next cycle (${shortDate(cycle.nextCycleStart)})`;
}

const CONTRACT_COLUMNS =
  "id, status, is_active, auto_generate, start_date, end_date, billing_frequency, billing_day_of_month, bill_month_in_advance, signed_at, created_at, last_billed_date, billing_anchor_date, monthly_amount_cents, monthly_amounts";

/**
 * After a contract becomes billable (marked Signed/Active, or a signed/active
 * contract is saved), the current cycle's billing day may already have passed —
 * e.g. it starts Jan 1 and the office enters it Jan 3. The daily run would bill
 * that cycle anyway (dated the run day); this asks first: bill it now, dated
 * today, or start billing with the next cycle (marks the cycle as billed so
 * nothing goes out for it).
 *
 * `check(contractId)` resolves once the question is answered (or immediately
 * when there's nothing to ask), so callers can await it before closing.
 */
export function useLateCyclePrompt() {
  const timeZone = useOrgTimeZone();
  const { mutateAsync: generateInvoices } = useGenerateContractInvoices();
  const { mutateAsync: updateContract } = useUpdateContract();
  const [pending, setPending] = useState<{ contractId: string; cycle: LateCycle } | null>(null);
  const [busy, setBusy] = useState<"bill" | "skip" | null>(null);
  const resolver = useRef<(() => void) | null>(null);

  async function check(contractId: string): Promise<void> {
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- billing_anchor_date is newer than the generated row type
      const { data: row } = await (supabase as any)
        .from("crm_contracts")
        .select(CONTRACT_COLUMNS)
        .eq("id", contractId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!row) return;
      const cycle = pendingLateCycle({ ...(row as LateCycleContractRow), time_zone: timeZone }, todayInZoneAsLocalMidnight(timeZone));
      if (!cycle) return;
      // An invoice already raised for this contract since that billing day (by
      // hand, or by Create Invoices) means the cycle is covered — nothing to ask.
      const { data: existing } = await supabase
        .from("crm_invoices")
        .select("id")
        .eq("contract_id", contractId)
        .is("deleted_at", null)
        .neq("status", "void")
        .gte("invoice_date", cycle.billingDay)
        .limit(1);
      if ((existing ?? []).length > 0) return;
      await new Promise<void>((resolve) => {
        resolver.current = resolve;
        setPending({ contractId, cycle });
      });
    } catch {
      // Best-effort: if the check fails, the daily run's own rule applies (bill it, dated that day).
    }
  }

  function finish() {
    setPending(null);
    setBusy(null);
    resolver.current?.();
    resolver.current = null;
  }

  async function billNow() {
    if (!pending) return;
    setBusy("bill");
    try {
      const [result] = await generateInvoices([pending.contractId]);
      if (result?.status === "created") toast.success("Invoice created, dated today");
      else toast.info(result?.reason ? `Not billed: ${result.reason}` : "Nothing to bill for this cycle");
      finish();
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Couldn't create the invoice"));
      setBusy(null);
    }
  }

  async function skipCycle() {
    if (!pending) return;
    setBusy("skip");
    try {
      await updateContract({ id: pending.contractId, updates: pending.cycle.skipUpdate });
      toast.success(`Billing starts with ${nextLabel(pending.cycle)}`);
      finish();
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Couldn't update the contract"));
      setBusy(null);
    }
  }

  const element = pending ? (
    // An alert dialog: no close button and no click-outside — a choice is required.
    <AlertDialog open>
      <AlertDialogContent className="max-w-md" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Bill {cycleLabel(pending.cycle.frequency, pending.cycle.periodStart, pending.cycle.periodEnd)}?</AlertDialogTitle>
          <AlertDialogDescription>
            This contract&apos;s billing day for {cycleLabel(pending.cycle.frequency, pending.cycle.periodStart, pending.cycle.periodEnd)} (
            {shortDate(pending.cycle.billingDay)}) has already passed. Bill it now with an invoice dated today, or skip it and start
            billing with {nextLabel(pending.cycle)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button className="w-full" onClick={billNow} disabled={!!busy}>
            {busy === "bill" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Bill ${cycleLabel(pending.cycle.frequency, pending.cycle.periodStart, pending.cycle.periodEnd)} now (dated today)`}
          </Button>
          <Button className="w-full" variant="outline" onClick={skipCycle} disabled={!!busy}>
            {busy === "skip" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Start billing with ${nextLabel(pending.cycle)}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { check, element };
}
