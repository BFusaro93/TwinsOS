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

interface DraftTier {
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

/** Tiered storm-depth pricing for "Per Event, Per Inch" snow billing — e.g.
 *  0-3in flat $X, 3-6in flat $Y, ... 12+in $D per inch. When a job has tiers
 *  configured, snow invoicing prices off these instead of the flat Rate Per
 *  Inch field. */
export function SnowRateTiersEditor({ jobId }: { jobId: string }) {
  const { data: savedTiers = [], isLoading } = useSnowRateTiers(jobId);
  const saveTiers = useSaveSnowRateTiers();
  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isLoading || hydrated) return;
    setTiers(savedTiers.map(toDraft));
    setHydrated(true);
  }, [isLoading, hydrated, savedTiers]);

  function addTier() {
    const last = tiers[tiers.length - 1];
    setTiers([
      ...tiers,
      { minInches: last?.maxInches || "", maxInches: "", rateDollars: "", ratePerInchDollars: "" },
    ]);
  }

  function removeTier(i: number) {
    setTiers(tiers.filter((_, j) => j !== i));
  }

  function updateTier(i: number, patch: Partial<DraftTier>) {
    setTiers(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function handleSave() {
    const parsed: TierInput[] = [];
    for (const t of tiers) {
      const minInches = parseFloat(t.minInches);
      if (!Number.isFinite(minInches)) {
        toast.error("Every tier needs a starting depth (inches).");
        return;
      }
      const isOpenEnded = t.maxInches.trim() === "";
      if (isOpenEnded) {
        const ratePerInchCents = Math.round(parseFloat(t.ratePerInchDollars || "0") * 100);
        if (!ratePerInchCents) {
          toast.error("The open-ended top tier needs a rate per inch.");
          return;
        }
        parsed.push({ minInches, maxInches: null, rateCents: null, ratePerInchCents });
      } else {
        const maxInches = parseFloat(t.maxInches);
        const rateCents = Math.round(parseFloat(t.rateDollars || "0") * 100);
        if (!Number.isFinite(maxInches) || !rateCents) {
          toast.error("Every bounded tier needs an ending depth and a flat rate.");
          return;
        }
        parsed.push({ minInches, maxInches, rateCents, ratePerInchCents: null });
      }
    }
    try {
      await saveTiers.mutateAsync({ jobId, tiers: parsed });
      toast.success("Rate tiers saved.");
    } catch {
      toast.error("Failed to save rate tiers.");
    }
  }

  if (isLoading) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-500">Storm Depth Rate Tiers (optional)</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={addTier}>
          <Plus className="mr-1 h-3 w-3" />
          Add Tier
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">
        Prices this storm by its total depth instead of the flat Rate Per Inch above. Leave the last
        tier&apos;s &quot;to&quot; blank for an open-ended top tier billed per inch (e.g. 12+&quot;).
      </p>
      {tiers.length === 0 && (
        <p className="text-xs italic text-slate-400">No tiers — billed at the flat Rate Per Inch above.</p>
      )}
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            type="number" min="0" step="0.5" placeholder="From"
            value={t.minInches}
            onChange={(e) => updateTier(i, { minInches: e.target.value })}
            className="h-7 w-16 text-xs"
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="number" min="0" step="0.5" placeholder="∞"
            value={t.maxInches}
            onChange={(e) => updateTier(i, { maxInches: e.target.value })}
            className="h-7 w-16 text-xs"
          />
          <span className="text-xs text-slate-400">in.</span>
          {t.maxInches.trim() === "" ? (
            <>
              <span className="text-xs text-slate-400">$</span>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={t.ratePerInchDollars}
                onChange={(e) => updateTier(i, { ratePerInchDollars: e.target.value })}
                className="h-7 w-20 text-xs"
              />
              <span className="text-xs text-slate-400">/ in.</span>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-400">flat $</span>
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
            className="ml-auto text-slate-300 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        className="h-7 self-start text-xs"
        onClick={handleSave}
        disabled={saveTiers.isPending}
      >
        {saveTiers.isPending ? "Saving…" : "Save Tiers"}
      </Button>
    </div>
  );
}
