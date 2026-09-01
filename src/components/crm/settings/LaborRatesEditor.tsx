"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { useSettingsStore } from "@/stores/settings-store";

// Same org-level customizations.breakevenLaborRateCents / burdenedLaborRateCents
// fields the Equipt settings page (Settings → General → Finance) edits —
// this isn't a separate Landscapt-only value, it's the one org-wide rate,
// just also surfaced here since Landscapt estimates are the primary
// consumer of it (getBreakevenRateCents in estimate-calc.ts auto-fills a
// line item's cost from Budgeted Hours × this rate). Kept in both places
// rather than moved, since Equipt's Projects (PO module) also reads
// breakevenLaborRateCents for its own labor-cost defaults.
export function LaborRatesEditor() {
  const { breakevenLaborRateCents, setBreakevenLaborRateCents, burdenedLaborRateCents, setBurdenedLaborRateCents } =
    useSettingsStore();
  const { data: remoteSettings } = useOrgSettings();
  const { mutate: updateOrgSettings } = useUpdateOrgSettings();

  const [breakevenDraft, setBreakevenDraft] = useState((breakevenLaborRateCents / 100).toFixed(2));
  const [burdenedDraft, setBurdenedDraft] = useState((burdenedLaborRateCents / 100).toFixed(2));
  const seeded = useRef(false);

  useEffect(() => {
    if (!remoteSettings || seeded.current) return;
    seeded.current = true;
    const customizations = (remoteSettings.customizations as Record<string, unknown>) ?? {};
    const savedRate = customizations.breakevenLaborRateCents;
    if (typeof savedRate === "number") setBreakevenDraft((savedRate / 100).toFixed(2));
    const savedBurdened = customizations.burdenedLaborRateCents;
    if (typeof savedBurdened === "number") setBurdenedDraft((savedBurdened / 100).toFixed(2));
  }, [remoteSettings]);

  // Compare against what's ACTUALLY persisted, not the zustand store's
  // in-memory value — the store ships with hardcoded placeholder defaults
  // (6927 / 5200, i.e. "$69.27" / "$52.00") that are never written to the
  // DB on their own. Comparing against those made Save permanently disable
  // itself for anyone whose intended rate happened to match the
  // placeholder, even though nothing had ever actually been saved.
  const remoteCustomizations = (remoteSettings?.customizations as Record<string, unknown>) ?? {};
  const persistedBreakevenCents =
    typeof remoteCustomizations.breakevenLaborRateCents === "number" ? remoteCustomizations.breakevenLaborRateCents : -1;
  const persistedBurdenedCents =
    typeof remoteCustomizations.burdenedLaborRateCents === "number" ? remoteCustomizations.burdenedLaborRateCents : -1;

  return (
    <div className="space-y-4 text-xs">
      <p className="text-slate-500">
        Used to auto-fill an estimate line item&apos;s Cost from its Budgeted Hours (Cost = Budgeted Hours ×
        Break-Even Labor Rate) whenever Cost is left at $0. This is the same org-wide rate set in Equipt →
        Settings → General → Finance — editing it here updates that too.
      </p>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-700">Break-Even Labor Rate</label>
        <p className="text-[11px] text-slate-400">
          Fully-loaded cost per labor hour — wages + burden + non-billable uplift + fixed overhead recovery (LLR + Overhead).
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={breakevenDraft}
            onChange={(e) => setBreakevenDraft(e.target.value)}
            className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <span className="text-sm text-slate-500">/hr</span>
          <Button
            size="sm"
            className="h-8"
            disabled={Math.round(parseFloat(breakevenDraft) * 100) === persistedBreakevenCents}
            onClick={() => {
              const cents = Math.round((parseFloat(breakevenDraft) || 0) * 100);
              setBreakevenLaborRateCents(cents);
              updateOrgSettings({ customizations: { breakevenLaborRateCents: cents } });
            }}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-700">Loaded Labor Rate (LLR)</label>
        <p className="text-[11px] text-slate-400">
          Wages + burden + non-billable uplift only — no fixed overhead recovery.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={burdenedDraft}
            onChange={(e) => setBurdenedDraft(e.target.value)}
            className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <span className="text-sm text-slate-500">/hr</span>
          <Button
            size="sm"
            className="h-8"
            disabled={Math.round(parseFloat(burdenedDraft) * 100) === persistedBurdenedCents}
            onClick={() => {
              const cents = Math.round((parseFloat(burdenedDraft) || 0) * 100);
              setBurdenedLaborRateCents(cents);
              updateOrgSettings({ customizations: { burdenedLaborRateCents: cents } });
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
