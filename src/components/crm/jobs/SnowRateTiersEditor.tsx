"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useSnowRateTiers,
  useSaveSnowRateTiers,
  type TierInput,
} from "@/lib/hooks/use-snow-rate-tiers";

export interface DraftTier {
  minInches: string;
  maxInches: string; // "" = open-ended top tier
  rateDollars: string; // flat rate for a bounded tier
  ratePerInchDollars: string; // per-inch rate for the open-ended tier
}

function toDraft(t: { minInches: number; maxInches: number | null; rateCents: number | null; ratePerInchCents: number | null }): DraftTier {
  return {
    minInches: String(t.minInches),
    maxInches: t.maxInches != null ? String(t.maxInches) : "",
    rateDollars: t.rateCents != null ? (t.rateCents / 100).toFixed(2) : "",
    ratePerInchDollars: t.ratePerInchCents != null ? (t.ratePerInchCents / 100).toFixed(2) : "",
  };
}

/** Validates the editor rows and converts them to tiers; toasts and returns null on a problem. */
export function parseTierDrafts(tiers: DraftTier[]): TierInput[] | null {
  const parsed: TierInput[] = [];
  for (const t of tiers) {
    const minInches = parseFloat(t.minInches);
    if (!Number.isFinite(minInches)) {
      toast.error("Every tier needs a starting depth (inches).");
      return null;
    }
    const isOpenEnded = t.maxInches.trim() === "";
    if (isOpenEnded) {
      const ratePerInchCents = Math.round(parseFloat(t.ratePerInchDollars || "0") * 100);
      if (!ratePerInchCents) {
        toast.error("The open-ended top tier needs a rate per inch.");
        return null;
      }
      parsed.push({ minInches, maxInches: null, rateCents: null, ratePerInchCents });
    } else {
      const maxInches = parseFloat(t.maxInches);
      const rateCents = Math.round(parseFloat(t.rateDollars || "0") * 100);
      if (!Number.isFinite(maxInches) || !rateCents) {
        toast.error("Every bounded tier needs an ending depth and a flat rate.");
        return null;
      }
      parsed.push({ minInches, maxInches, rateCents, ratePerInchCents: null });
    }
  }

  // priceWithTiers (src/lib/snow-billing.ts) sorts by minInches and
  // returns the FIRST matching tier — an overlap silently makes every
  // tier after the first match for a given depth unreachable, with no
  // error ever surfacing to whoever created the overlap. Validate here
  // instead of trusting the editor's row order.
  const sorted = [...parsed].sort((a, b) => a.minInches - b.minInches);
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.maxInches === null) {
      toast.error(
        `"${current.minInches}"+ is open-ended but isn't the last tier — the tier(s) after it can never apply.`
      );
      return null;
    }
    if (next.minInches < current.maxInches) {
      toast.error(
        `Tiers overlap between ${current.minInches}–${current.maxInches}" and ${next.minInches}"+ — a storm in the overlap always prices at the lower tier's rate.`
      );
      return null;
    }
  }
  return parsed;
}

/** The tier rows themselves (controlled). Shared by the saved-job editor and the New Job dialog. */
export function SnowRateTierRows({
  tiers,
  onChange,
  perPush,
}: {
  tiers: DraftTier[];
  onChange: (tiers: DraftTier[]) => void;
  /** Per Push jobs price each push by ITS depth; per-event jobs price the storm's total depth. */
  perPush?: boolean;
}) {
  function addTier() {
    const last = tiers[tiers.length - 1];
    onChange([...tiers, { minInches: last?.maxInches || "", maxInches: "", rateDollars: "", ratePerInchDollars: "" }]);
  }
  function removeTier(i: number) {
    onChange(tiers.filter((_, j) => j !== i));
  }
  function updateTier(i: number, patch: Partial<DraftTier>) {
    onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Interval Billing — Rate by Inches (optional)</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={addTier}>
          <Plus className="mr-1 h-3 w-3" />
          Add Range
        </Button>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-neutral-500">
        {perPush
          ? "Prices each push by the depth recorded for that push (e.g. 0–3\" = $165, 3.01–6\" = $299)"
          : "Prices the storm by its total depth (e.g. 0–3\" = $165, 3.01–6\" = $299)"}
        {" "}instead of a flat rate per inch. Leave the last range&apos;s &quot;to&quot; blank for an open-ended top range billed per inch.
      </p>
      {tiers.length === 0 && (
        <p className="text-xs italic text-slate-400 dark:text-neutral-500">No ranges — billed at the flat Rate Per Inch.</p>
      )}
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            type="number" min="0" step="0.01" placeholder="From"
            value={t.minInches}
            onChange={(e) => updateTier(i, { minInches: e.target.value })}
            className="h-7 w-16 text-xs"
          />
          <span className="text-xs text-slate-400 dark:text-neutral-500">to</span>
          <Input
            type="number" min="0" step="0.01" placeholder="∞"
            value={t.maxInches}
            onChange={(e) => updateTier(i, { maxInches: e.target.value })}
            className="h-7 w-16 text-xs"
          />
          <span className="text-xs text-slate-400 dark:text-neutral-500">in.</span>
          {t.maxInches.trim() === "" ? (
            <>
              <span className="text-xs text-slate-400 dark:text-neutral-500">$</span>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={t.ratePerInchDollars}
                onChange={(e) => updateTier(i, { ratePerInchDollars: e.target.value })}
                className="h-7 w-20 text-xs"
              />
              <span className="text-xs text-slate-400 dark:text-neutral-500">/ in.</span>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-400 dark:text-neutral-500">flat $</span>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={t.rateDollars}
                onChange={(e) => updateTier(i, { rateDollars: e.target.value })}
                className="h-7 w-20 text-xs"
              />
            </>
          )}
          <button
            type="button"
            onClick={() => removeTier(i)}
            className="ml-auto text-slate-300 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </>
  );
}

/** Interval billing for a job being created — held in the dialog and saved with the job. */
export function SnowRateTiersDraftEditor({
  tiers,
  onChange,
  perPush,
}: {
  tiers: DraftTier[];
  onChange: (tiers: DraftTier[]) => void;
  perPush?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-slate-50 dark:bg-muted/40 p-3">
      <SnowRateTierRows tiers={tiers} onChange={onChange} perPush={perPush} />
    </div>
  );
}

/** Interval billing (rate by inches) for a saved snow job — e.g. 0-3in flat $X,
 *  3-6in flat $Y, ... 12+in $D per inch. When a job has ranges configured, snow
 *  invoicing prices off them instead of the flat Rate Per Inch field. */
export function SnowRateTiersEditor({ jobId, perPush }: { jobId: string; perPush?: boolean }) {
  const { data: savedTiers = [], isLoading } = useSnowRateTiers(jobId);
  const saveTiers = useSaveSnowRateTiers();
  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isLoading || hydrated) return;
    setTiers(savedTiers.map(toDraft));
    setHydrated(true);
  }, [isLoading, hydrated, savedTiers]);

  async function handleSave() {
    const parsed = parseTierDrafts(tiers);
    if (!parsed) return;
    try {
      await saveTiers.mutateAsync({ jobId, tiers: parsed });
      toast.success("Rate ranges saved.");
    } catch {
      toast.error("Failed to save rate ranges.");
    }
  }

  if (isLoading) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-slate-50 dark:bg-muted/40 p-3">
      <SnowRateTierRows tiers={tiers} onChange={setTiers} perPush={perPush} />
      <Button
        type="button"
        size="sm"
        className="h-7 self-start text-xs"
        onClick={handleSave}
        disabled={saveTiers.isPending}
      >
        {saveTiers.isPending ? "Saving…" : "Save Ranges"}
      </Button>
    </div>
  );
}
