"use client";

import { useRef, useState, type ReactNode } from "react";
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
import {
  MISSED_CYCLE_CONTRACT_COLUMNS,
  cycleShortLabel,
  fetchContractInvoiceRefs,
  useBillContractCatchUp,
  useGenerateContractInvoices,
  useUpdateContract,
} from "@/lib/hooks/use-contracts";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZoneAsLocalMidnight } from "@/lib/time/zone";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";
import { formatCurrency } from "@/lib/utils";
import {
  cycleBilledBy,
  pendingLateCycle,
  unbilledContractCycles,
  type ContractCycle,
  type LateCycle,
  type LateCycleContractRow,
} from "@/lib/contract-billing";

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

interface Pending {
  contractId: string;
  /** The cycle the daily run would bill late (dated the run day) — null when it isn't due yet. */
  current: LateCycle | null;
  currentCycle: ContractCycle | null;
  /** Earlier cycles no run will ever bill on its own (the contract was signed / activated late). */
  older: ContractCycle[];
  /** The contract's last_billed_date / billing_anchor_date, for "don't bill them". */
  lastBilledDate: string | null;
  billingAnchorDate: string | null;
}

/**
 * After a contract becomes billable (marked Signed/Active, made active again,
 * or a signed/active contract is saved), lists every billing cycle since its
 * start date that hasn't been billed — e.g. a contract starting Aug 1 that was
 * signed Nov 10 lists Aug, Sep, Oct and Nov — and asks what to do:
 *  - bill all of them now (the current cycle as its normal invoice, the earlier
 *    ones on one catch-up invoice, all dated today);
 *  - bill only the current cycle (the earlier ones are left unbilled);
 *  - start billing with the next cycle (nothing goes out now).
 * With only the current cycle late, it is the plain "bill it now / start with
 * the next one" question. Cycles that passed while the contract was switched
 * inactive are never listed (their visits billed per visit).
 *
 * "Already billed" is read the way the billing paths read it (cycleBilledBy):
 * a VOID invoice in a cycle still counts as that cycle's invoice.
 *
 * `check(contractId)` resolves once the question is answered (or immediately
 * when there's nothing to ask), so callers can await it before closing.
 */
export function useLateCyclePrompt() {
  const timeZone = useOrgTimeZone();
  const { mutateAsync: generateInvoices } = useGenerateContractInvoices();
  const { mutateAsync: billCatchUp } = useBillContractCatchUp();
  const { mutateAsync: updateContract } = useUpdateContract();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<"all" | "current" | "skip" | null>(null);
  const resolver = useRef<(() => void) | null>(null);

  async function check(contractId: string): Promise<void> {
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- newer columns than the generated row type
      const { data: row } = await (supabase as any)
        .from("crm_contracts")
        .select(MISSED_CYCLE_CONTRACT_COLUMNS)
        .eq("id", contractId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!row) return;
      const contract = { ...(row as LateCycleContractRow), time_zone: timeZone };
      const today = todayInZoneAsLocalMidnight(timeZone);
      const refs = await fetchContractInvoiceRefs(contractId);
      const cycles = unbilledContractCycles(contract, today).filter((c) => !cycleBilledBy(c, refs));
      let current = pendingLateCycle(contract, today);
      if (current && cycleBilledBy(current, refs)) current = null;
      const currentCycle = current ? cycles.find((c) => c.periodStart === current!.periodStart) ?? null : null;
      const older = cycles.filter((c) => !c.isCurrent && c.periodStart !== current?.periodStart);
      if (!current && older.length === 0) return;
      await new Promise<void>((resolve) => {
        resolver.current = resolve;
        setPending({
          contractId,
          current,
          currentCycle,
          older,
          lastBilledDate: (row as { last_billed_date?: string | null }).last_billed_date ?? null,
          billingAnchorDate: (row as { billing_anchor_date?: string | null }).billing_anchor_date ?? null,
        });
      });
    } catch {
      // Best-effort: if the check fails, the daily run's own rule applies (bill the current cycle, dated that day).
    }
  }

  function finish() {
    setPending(null);
    setBusy(null);
    resolver.current?.();
    resolver.current = null;
  }

  async function billAll() {
    if (!pending) return;
    setBusy("all");
    try {
      const notes: string[] = [];
      let created = 0;
      if (pending.current) {
        const [result] = await generateInvoices([pending.contractId]);
        if (result?.status === "created") created += 1;
        else if (result?.reason) notes.push(result.reason);
      }
      if (pending.older.length > 0) {
        const result = await billCatchUp({ contractId: pending.contractId, cycles: pending.older });
        if (result.status === "created") created += 1;
        else if (result.reason) notes.push(result.reason);
      }
      if (created > 0) toast.success(created === 1 ? "Invoice created, dated today" : `${created} invoices created, dated today`);
      if (notes.length > 0) toast.info(`Not billed: ${notes.join("; ")}`);
      finish();
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Couldn't create the invoices"));
      setBusy(null);
    }
  }

  async function billCurrentOnly() {
    if (!pending?.current) return;
    setBusy("current");
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

  async function skip() {
    if (!pending) return;
    setBusy("skip");
    try {
      if (pending.current) {
        // Marks the current cycle billed, so billing starts with the next one; the earlier
        // cycles sit before it and are never asked about again.
        await updateContract({ id: pending.contractId, updates: pending.current.skipUpdate });
        toast.success(`Billing starts with ${nextLabel(pending.current)}`);
      } else {
        // No current cycle due yet: move last_billed_date past the earlier cycles only, so the
        // next regular run still bills on its own day.
        const last = pending.older[pending.older.length - 1]!;
        const first = pending.older[0]!;
        const frequency = last.frequency;
        await updateContract({
          id: pending.contractId,
          updates: {
            last_billed_date: pending.lastBilledDate && pending.lastBilledDate > last.cycleStart ? pending.lastBilledDate : last.cycleStart,
            ...(!pending.billingAnchorDate && (frequency === "quarterly" || frequency === "annual") ? { billing_anchor_date: first.cycleStart } : {}),
          },
        });
        toast.success("The missed cycles won't be billed");
      }
      finish();
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Couldn't update the contract"));
      setBusy(null);
    }
  }

  let element: ReactNode = null;
  if (pending) {
    const { current, currentCycle, older } = pending;
    const all = [...older, ...(currentCycle ? [currentCycle] : [])].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    const allTotal = all.reduce((s, c) => s + c.amountCents, 0);
    const currentLabel = current ? cycleLabel(current.frequency, current.periodStart, current.periodEnd) : "";
    element = (
      // An alert dialog: no close button and no click-outside — a choice is required.
      <AlertDialog open>
        <AlertDialogContent className="max-w-md" onEscapeKeyDown={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {older.length === 0 ? `Bill ${currentLabel}?` : `${all.length} billing cycle${all.length !== 1 ? "s" : ""} not billed yet`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {older.length === 0 && current ? (
                  <p>
                    This contract&apos;s billing day for {currentLabel} ({shortDate(current.billingDay)}) has already passed. Bill it now
                    with an invoice dated today, or skip it and start billing with {nextLabel(current)}.
                  </p>
                ) : (
                  <>
                    <p>
                      This contract became billable after these cycles&apos; billing days, so the daily run won&apos;t bill
                      {current ? " the earlier ones" : " them"} on its own:
                    </p>
                    <ul className="max-h-40 overflow-y-auto rounded border px-3 py-1.5">
                      {all.map((c) => (
                        <li key={c.periodStart} className="flex justify-between gap-3 py-0.5 tabular-nums">
                          <span>
                            {cycleShortLabel(c)}
                            {c.isCurrent || c.periodStart === current?.periodStart ? " (current)" : ""}
                          </span>
                          <span>{formatCurrency(c.amountCents)}</span>
                        </li>
                      ))}
                    </ul>
                    <p>
                      Work done in a cycle you don&apos;t bill is not billed per visit either — the contract covers it.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {older.length > 0 && (
              <Button className="w-full" onClick={billAll} disabled={!!busy}>
                {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Bill all ${all.length} (${formatCurrency(allTotal)}, dated today)`}
              </Button>
            )}
            {current && (
              <Button className="w-full" variant={older.length > 0 ? "outline" : "default"} onClick={billCurrentOnly} disabled={!!busy}>
                {busy === "current" ? <Loader2 className="h-4 w-4 animate-spin" /> : older.length > 0 ? `Bill ${currentLabel} only (dated today)` : `Bill ${currentLabel} now (dated today)`}
              </Button>
            )}
            <Button className="w-full" variant="outline" onClick={skip} disabled={!!busy}>
              {busy === "skip" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : current ? (
                `Start billing with ${nextLabel(current)}`
              ) : (
                "Don't bill them — continue with the next billing day"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return { check, element };
}
