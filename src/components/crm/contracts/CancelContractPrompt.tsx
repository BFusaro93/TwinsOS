"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import type { ContractFutureDraft } from "@/lib/hooks/use-contracts";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${SHORT[m - 1]} ${d}, ${y}`;
}

interface Ask {
  /** Linked jobs still open — they bill per visit once the contract is cancelled. */
  openJobs: number;
  /** The contract's draft invoices dated after today. */
  drafts: ContractFutureDraft[];
  /** The contract was never signed (draft / sent): its held visits bill per visit. */
  unsigned: boolean;
}

/** The answer: null = keep the contract; otherwise the drafts to void. */
type Answer = { voidDrafts: ContractFutureDraft[] } | null;

/**
 * Confirms cancelling a contract and says what happens next: open linked jobs
 * bill per visit from now on, visits held while it was unsigned bill per visit,
 * and — the part that needs a decision — draft invoices already raised for
 * dates after today (bill 1 month in advance, or an early Create Invoices) are
 * listed with a checkbox each to void them. All are ticked by default: the
 * contract won't be serving that time.
 */
export function useCancelContractPrompt() {
  const [state, setState] = useState<Ask | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const resolver = useRef<((a: Answer) => void) | null>(null);

  function ask(input: Ask): Promise<Answer> {
    setChosen(new Set(input.drafts.map((d) => d.id)));
    setState(input);
    return new Promise<Answer>((resolve) => {
      resolver.current = resolve;
    });
  }

  function close(answer: Answer) {
    setState(null);
    resolver.current?.(answer);
    resolver.current = null;
  }

  let element: ReactNode = null;
  if (state) {
    const { openJobs, drafts, unsigned } = state;
    element = (
      <AlertDialog open onOpenChange={(o) => { if (!o) close(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this contract?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {openJobs > 0 && (
                  <p>
                    {openJobs} linked job{openJobs !== 1 ? "s" : ""} will bill per visit on the client&apos;s normal invoicing
                    frequency instead of inside the contract price, and upcoming visits that haven&apos;t started are cancelled.
                  </p>
                )}
                {unsigned && (
                  <p>
                    The contract was never signed, so visits completed while it was waiting are billed per visit now.
                  </p>
                )}
                {drafts.length > 0 && (
                  <>
                    <p>
                      {drafts.length === 1 ? "This draft invoice was" : "These draft invoices were"} already raised for dates after
                      today. Void the ones the client shouldn&apos;t pay:
                    </p>
                    <ul className="max-h-40 overflow-y-auto rounded border px-3 py-1.5">
                      {drafts.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 py-0.5 tabular-nums">
                          <Checkbox
                            id={`void-${d.id}`}
                            checked={chosen.has(d.id)}
                            onCheckedChange={(v) =>
                              setChosen((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(d.id);
                                else next.delete(d.id);
                                return next;
                              })
                            }
                          />
                          <label htmlFor={`void-${d.id}`} className="flex flex-1 justify-between gap-3">
                            <span>
                              {d.invoiceNumber != null ? `#${d.invoiceNumber}` : "Draft"} · {shortDate(d.invoiceDate)}
                            </span>
                            <span>{formatCurrency(d.totalCents)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {openJobs === 0 && !unsigned && drafts.length === 0 && <p>No further invoices will be generated for it.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="outline" onClick={() => close(null)}>Keep Contract</Button>
            <Button
              variant="destructive"
              onClick={() => close({ voidDrafts: drafts.filter((d) => chosen.has(d.id)) })}
            >
              {chosen.size > 0 ? `Cancel & Void ${chosen.size}` : "Cancel Contract"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return { ask, element };
}
