"use client";

import { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/shared/useConfirm";
import { formatCurrency } from "@/lib/utils";
import {
  useOtherCharges,
  useCreateOtherCharge,
  useUpdateOtherCharge,
  useDeleteOtherCharge,
  useSeedCommonOtherCharges,
} from "@/lib/hooks/use-other-charges";

interface Draft {
  name: string;
  description: string;
  amount: string;
  isTaxable: boolean;
}

const EMPTY_DRAFT: Draft = { name: "", description: "", amount: "", isTaxable: false };

function parseAmountCents(raw: string): number | null {
  if (raw.trim() === "") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function ChargeForm({
  draft, onChange, onSubmit, onCancel, submitLabel, saving,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_2fr_7rem_auto]">
      <Input
        autoFocus
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder="Name (e.g. Late Fee)"
        className="h-8 text-sm"
      />
      <Input
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder="Description shown on the invoice"
        className="h-8 text-sm"
      />
      <Input
        type="number"
        min="0"
        step="0.01"
        value={draft.amount}
        onChange={(e) => onChange({ ...draft, amount: e.target.value })}
        placeholder="Amount $"
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400">
          <Switch checked={draft.isTaxable} onCheckedChange={(v) => onChange({ ...draft, isTaxable: v })} />
          Taxable
        </label>
        <Button size="sm" className="h-8" onClick={onSubmit} disabled={saving}>{submitLabel}</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function OtherChargesEditor() {
  const [confirm, confirmDialog] = useConfirm();
  const { data: charges = [], isLoading } = useOtherCharges();
  const { mutateAsync: createCharge, isPending: creating } = useCreateOtherCharge();
  const { mutateAsync: updateCharge, isPending: updating } = useUpdateOtherCharge();
  const { mutateAsync: deleteCharge } = useDeleteOtherCharge();
  const { mutateAsync: seedCharges, isPending: seeding } = useSeedCommonOtherCharges();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  function validate(): { name: string; description: string; amountCents: number; isTaxable: boolean } | null {
    const name = draft.name.trim();
    if (!name) { toast.error("Enter a name"); return null; }
    const amountCents = parseAmountCents(draft.amount);
    if (amountCents === null) { toast.error("Enter a valid amount"); return null; }
    return { name, description: draft.description.trim(), amountCents, isTaxable: draft.isTaxable };
  }

  async function handleAdd() {
    const v = validate();
    if (!v) return;
    try {
      await createCharge(v);
      toast.success("Other charge added");
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    } catch (err) {
      toast.error(`Failed to add: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleSaveEdit(id: string) {
    const v = validate();
    if (!v) return;
    try {
      await updateCharge({ id, updates: v });
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleSeed() {
    try {
      const n = await seedCharges(charges.map((c) => c.name));
      toast.success(n > 0 ? `Added ${n} common charge${n === 1 ? "" : "s"} at $0.00. Set the amounts you charge.` : "You already have them all");
    } catch (err) {
      toast.error(`Failed to add: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleRemove(id: string) {
    if (!(await confirm({ title: "Remove this other charge?", confirmLabel: "Remove", destructive: true }))) return;
    try { await deleteCharge(id); toast.success("Other charge removed"); }
    catch { toast.error("Failed to remove"); }
  }

  if (isLoading) return <p className="py-2 text-sm text-slate-400 dark:text-neutral-500">Loading…</p>;

  return (
    <div className="divide-y">
      {charges.map((c) =>
        editingId === c.id ? (
          <ChargeForm
            key={c.id}
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void handleSaveEdit(c.id)}
            onCancel={() => { setEditingId(null); setDraft(EMPTY_DRAFT); }}
            submitLabel="Save"
            saving={updating}
          />
        ) : (
          <div key={c.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-neutral-100">
                {c.name}
                {c.isTaxable && <span className="ml-2 rounded bg-amber-50 px-1 text-[10px] text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">Tax</span>}
              </p>
              {c.description && c.description !== c.name && (
                <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-neutral-500">{c.description}</p>
              )}
            </div>
            <span className="text-sm tabular-nums text-slate-700 dark:text-neutral-300">{formatCurrency(c.amountCents)}</span>
            <Switch
              checked={c.isActive}
              onCheckedChange={(v) => void updateCharge({ id: c.id, updates: { isActive: v } })}
              title={c.isActive ? "Active" : "Inactive"}
            />
            <button
              onClick={() => {
                setAdding(false);
                setEditingId(c.id);
                setDraft({
                  name: c.name,
                  description: c.description,
                  amount: c.amountCents ? (c.amountCents / 100).toFixed(2) : "",
                  isTaxable: c.isTaxable,
                });
              }}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-neutral-500 dark:hover:bg-muted/40 dark:hover:text-neutral-300"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => void handleRemove(c.id)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      )}

      {charges.length === 0 && !adding && (
        <div className="flex flex-wrap items-center gap-3 py-3">
          <p className="text-sm text-slate-400 dark:text-neutral-500">No other charges yet.</p>
          <Button size="sm" variant="outline" onClick={() => void handleSeed()} disabled={seeding}>
            {seeding ? "Adding…" : "Add common charges"}
          </Button>
          <span className="text-xs text-slate-400 dark:text-neutral-500">Late fee, trip charge, fuel surcharge and more, at $0.00 for you to price.</span>
        </div>
      )}

      {adding ? (
        <ChargeForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void handleAdd()}
          onCancel={() => { setAdding(false); setDraft(EMPTY_DRAFT); }}
          submitLabel="Add"
          saving={creating}
        />
      ) : (
        <div className="pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); setAdding(true); }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Other Charge
          </Button>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
