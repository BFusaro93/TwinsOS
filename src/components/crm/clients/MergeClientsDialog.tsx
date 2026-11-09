"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClient, useClientSearch } from "@/lib/hooks/use-clients";
import { describeMergeCounts, useMergeClients, useMergeClientsPreview } from "@/lib/hooks/use-merge-clients";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/crm";

const CONFIRM_WORD = "MERGE";

function clientAddress(c: Client): string {
  const street = c.serviceAddress || c.billingAddress;
  const city = c.serviceAddress ? c.serviceCity : c.billingCity;
  const state = c.serviceAddress ? c.serviceState : c.billingState;
  return [street, city, state].filter(Boolean).join(", ");
}

function isLead(c: Client): boolean {
  return c.status === "lead" || c.status === "lost";
}

function ClientSummary({ client }: { client: Client }) {
  const address = clientAddress(client);
  return (
    <div className="min-w-0 text-left">
      <div className="truncate text-sm font-medium">{client.displayName}</div>
      <div className="truncate text-xs text-muted-foreground">
        {[client.accountNumber ? `#${client.accountNumber}` : null, client.status].filter(Boolean).join(" · ")}
      </div>
      <div className="truncate text-xs text-muted-foreground">{address || "No address"}</div>
      <div className="text-xs text-muted-foreground">Balance {formatCurrency(client.balanceOutstandingCents)}</div>
    </div>
  );
}

export interface MergeClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The client being viewed — kept by default; the other one is picked here. */
  clientId: string;
}

/**
 * Merge a duplicate client into another: pick the duplicate, choose which
 * record survives, review what moves, type MERGE. Everything that pointed at
 * the retired record (properties, jobs, visits, invoices, payments, estimates,
 * contracts, tickets, timeline, files, portal logins, sub-accounts…) moves to
 * the kept one, which then fills its empty fields from the duplicate; the
 * duplicate is deleted. Runs as one transaction (crm_merge_clients).
 */
export function MergeClientsDialog({ open, onOpenChange, clientId }: MergeClientsDialogProps) {
  const router = useRouter();
  const { can, isLoading: permsLoading } = usePermissions();
  const allowed = can("client_allow_delete");

  const [term, setTerm] = useState("");
  const [other, setOther] = useState<Client | null>(null);
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  // Closing starts the next opening over.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTerm("");
      setOther(null);
      setKeepCurrent(true);
      setConfirmText("");
    }
    onOpenChange(next);
  }

  const { data: current } = useClient(clientId);
  const { data: results = [], isFetching: searching } = useClientSearch(
    term,
    { excludeIds: [clientId], limit: 20 },
    open && allowed && !other,
  );

  const keep = other ? (keepCurrent ? current ?? null : other) : null;
  const merge = other ? (keepCurrent ? other : current ?? null) : null;

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useMergeClientsPreview(keep?.id ?? null, merge?.id ?? null, open && allowed && !!keep && !!merge);
  const previewRows = useMemo(() => (preview ? describeMergeCounts(preview) : []), [preview]);

  const { mutateAsync: mergeClients, isPending } = useMergeClients();

  const leadBlocksKeep = !!keep && !!merge && isLead(keep) && !isLead(merge);
  const keepClosedWarning =
    !!keep && !!merge && (keep.status === "inactive" || keep.status === "cancelled") && merge.status === "active";
  const canSubmit =
    !!keep && !!merge && !leadBlocksKeep && !previewError && !previewLoading &&
    confirmText.trim() === CONFIRM_WORD && !isPending;

  async function handleMerge() {
    if (!keep || !merge || !canSubmit) return;
    try {
      const result = await mergeClients({ keepId: keep.id, mergeId: merge.id });
      toast.success(`Merged ${merge.displayName} into ${keep.displayName}`, {
        description: result.notes.length > 0 ? result.notes.join(" ") : undefined,
      });
      handleOpenChange(false);
      if (keep.id !== clientId) router.push(`/crm/clients/${keep.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't merge these clients");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) handleOpenChange(next); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate clients</DialogTitle>
          <DialogDescription>
            Everything on the duplicate moves to the client you keep, and the duplicate is deleted. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        {permsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !allowed ? (
          <p className="py-4 text-sm text-muted-foreground">
            Merging clients needs the &ldquo;Allow Cancel/Deactivate&rdquo; client permission. Ask an admin.
          </p>
        ) : !other ? (
          <div className="space-y-3">
            <div className="text-sm">
              Find the duplicate of <span className="font-medium">{current?.displayName ?? "this client"}</span>:
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                placeholder="Search by name, account #, phone, email or address"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {searching && results.length === 0 ? (
                <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : results.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No matching clients</div>
              ) : (
                results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setOther(c)}
                    className="flex w-full items-center px-3 py-2 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                  >
                    <ClientSummary client={c} />
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Which record do you want to keep?</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isPending}
                  onClick={() => { setOther(null); setConfirmText(""); }}
                >
                  <ArrowLeft className="mr-1 h-3 w-3" /> Pick another
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[current, other].map((c, i) => {
                  if (!c) {
                    return (
                      <div key={i} className="flex justify-center rounded-md border p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    );
                  }
                  const selected = (i === 0) === keepCurrent;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={isPending}
                      onClick={() => setKeepCurrent(i === 0)}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60",
                      )}
                    >
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {selected ? "Keep" : "Merge away & delete"}
                      </div>
                      <ClientSummary client={c} />
                    </button>
                  );
                })}
              </div>
            </div>

            {leadBlocksKeep && keep && merge && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{keep.displayName} is a lead. Keep the client record ({merge.displayName}) and merge the lead into it.</span>
              </div>
            )}
            {keepClosedWarning && keep && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {keep.displayName} is {keep.status}; the merge doesn&apos;t change its status. Reactivate it afterwards if the
                  combined account is still a customer.
                </span>
              </div>
            )}

            {!leadBlocksKeep && merge && (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Moves from {merge.displayName}</div>
                {previewLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : previewError ? (
                  <p className="text-xs text-red-700 dark:text-red-400">
                    {previewError instanceof Error ? previewError.message : "Couldn't check these clients"}
                  </p>
                ) : previewRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing is linked to {merge.displayName} yet.</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                    {previewRows.map((row) => (
                      <li key={row.key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="tabular-nums">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Empty fields on the kept client (phone, email, addresses, notes, measurements…) are filled from the
                  duplicate. Do-not-market carries over; the kept client&apos;s card on file and QuickBooks link win.
                </p>
              </div>
            )}

            {!leadBlocksKeep && (
              <div className="space-y-1.5">
                <Label htmlFor="merge-confirm">
                  Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
                </Label>
                <Input
                  id="merge-confirm"
                  autoComplete="off"
                  value={confirmText}
                  disabled={isPending}
                  onChange={(e) => setConfirmText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleMerge(); }}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          {allowed && other && (
            <Button variant="destructive" onClick={() => void handleMerge()} disabled={!canSubmit}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Merge clients
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
