"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useApplySavedMethodImport,
  usePreviewSavedMethodImport,
  type SavedMethodImportPreview,
} from "@/lib/hooks/use-crm-card-payments";
import type { ImportPreviewRow } from "@/lib/stripe/import-saved-methods";

/** A row can be imported only when it matched exactly one client with nothing on file. */
const isSelectable = (r: ImportPreviewRow) => r.status === "ready" && !r.method?.expired;

/** Email matches start checked; name-only guesses and expired cards start unchecked for a human to confirm. */
const startsSelected = (r: ImportPreviewRow) => isSelectable(r) && r.matchedBy === "email";

export function StripeMethodImport() {
  const { mutateAsync: loadPreview, isPending: scanning } = usePreviewSavedMethodImport();
  const { mutateAsync: apply, isPending: importing } = useApplySavedMethodImport();
  const [preview, setPreview] = useState<SavedMethodImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enableAutopay, setEnableAutopay] = useState(false);

  const ready = useMemo(() => preview?.rows.filter((r) => r.status === "ready") ?? [], [preview]);
  const skipped = useMemo(() => preview?.rows.filter((r) => r.status !== "ready") ?? [], [preview]);

  async function handleScan() {
    try {
      const result = await loadPreview();
      setPreview(result);
      setSelected(new Set(result.rows.filter(startsSelected).map((r) => r.customerId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read Stripe");
    }
  }

  async function handleImport() {
    const links = ready
      .filter((r) => selected.has(r.customerId) && r.client)
      .map((r) => ({ customerId: r.customerId, clientId: r.client!.id }));
    if (links.length === 0) return;
    try {
      const result = await apply({ links, enableAutopay });
      if (result.imported > 0) {
        toast.success(
          `Imported ${result.imported} saved payment method${result.imported === 1 ? "" : "s"}` +
            (result.autopayEnabled ? " with autopay on" : " (autopay off)")
        );
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} couldn't be imported — ${result.failed[0].error ?? "see Stripe"}`);
      }
      // Re-scan so imported rows move to "already on file" and failures stay visible.
      await handleScan();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import payment methods");
    }
  }

  function toggle(customerId: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(customerId);
      else next.delete(customerId);
      return next;
    });
  }

  const selectableIds = ready.filter(isSelectable).map((r) => r.customerId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  return (
    <div className="space-y-3 border-t p-4">
      <div>
        <p className="text-sm font-medium">Import saved cards from Stripe</p>
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          If this Stripe account already has customers with saved cards or bank accounts (for example from another
          system), match them to your clients here so autopay and one-click charges work without asking anyone to
          re-enter a card. Nothing changes until you confirm.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void handleScan()} disabled={scanning || importing}>
        {scanning ? "Reading Stripe…" : preview ? "Scan again" : "Find saved cards"}
      </Button>

      {preview && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-neutral-500">
            {preview.totalCustomers} Stripe customer{preview.totalCustomers === 1 ? "" : "s"} scanned
            {preview.customersWithoutMethod > 0 && `, ${preview.customersWithoutMethod} with no saved method`}.
            {preview.truncated && " Only the first 5,000 customers were read."}
          </p>

          {ready.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-neutral-400">No new matches to import.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="stripe-import-all"
                  checked={allSelected}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(selectableIds) : new Set())}
                />
                <label htmlFor="stripe-import-all" className="text-sm font-medium">
                  {ready.length} match{ready.length === 1 ? "" : "es"} found
                </label>
              </div>
              <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {ready.map((r) => (
                  <label key={r.customerId} className="flex cursor-pointer items-start gap-2 p-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(r.customerId)}
                      disabled={!isSelectable(r)}
                      onCheckedChange={(v) => toggle(r.customerId, v === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.client?.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-neutral-500">
                        Stripe: {r.customerName ?? "—"}
                        {r.customerEmail ? ` · ${r.customerEmail}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block">{r.method?.summary}</span>
                      <span className="block text-xs text-slate-500 dark:text-neutral-500">
                        {r.method?.expired ? "Expired" : r.matchedBy === "name" ? "Matched by name — check" : "Matched by email"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="stripe-import-autopay" checked={enableAutopay} onCheckedChange={(v) => setEnableAutopay(v === true)} />
                <label htmlFor="stripe-import-autopay" className="text-sm">
                  Turn on autopay for imported methods
                  <span className="block text-xs text-slate-500 dark:text-neutral-500">
                    Off by default: with autopay on, these clients&apos; invoices are charged automatically. Only enable it
                    if they already agreed to autopay.
                  </span>
                </label>
              </div>
              <Button size="sm" onClick={() => void handleImport()} disabled={importing || selected.size === 0}>
                {importing ? "Importing…" : `Import ${selected.size} selected`}
              </Button>
            </>
          )}

          {skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600 dark:text-neutral-400">
                {skipped.length} not importable
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-neutral-500">
                {skipped.map((r) => (
                  <li key={r.customerId}>
                    {r.customerName ?? r.customerEmail ?? r.customerId} · {r.method?.summary} — {r.note}
                    {r.client ? ` (${r.client.name})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
