"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useOverheadSettings,
  useUpsertOverheadSettings,
  type OverheadSettings,
} from "@/lib/hooks/use-overhead-settings";

interface FieldConfig {
  label: string;
  key: keyof Omit<OverheadSettings, "id">;
}

const FIELDS: FieldConfig[] = [
  { label: "Labor Overhead %", key: "laborOhBps" },
  { label: "Labor Burden %", key: "laborBurdenBps" },
  { label: "Subcontract / Contract OH%", key: "contractOhBps" },
  { label: "Equipment OH%", key: "equipmentOhBps" },
  { label: "Materials OH%", key: "materialsOhBps" },
  { label: "Other OH%", key: "otherOhBps" },
];

const FLAT_RATE_FIELD: FieldConfig = { label: "Default Flat Overhead Rate %", key: "flatOverheadRateBps" };

export function OverheadSettingsEditor() {
  const { data: settings, isLoading } = useOverheadSettings();
  const { mutateAsync: upsert } = useUpsertOverheadSettings();

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!settings) return;
    const initial: Record<string, string> = {};
    for (const f of [...FIELDS, FLAT_RATE_FIELD]) {
      initial[f.key] = String((settings[f.key] / 100).toFixed(2));
    }
    setDrafts(initial);
  }, [settings]);

  async function handleBlur(key: keyof Omit<OverheadSettings, "id">) {
    if (!settings) return;
    const raw = parseFloat(drafts[key] ?? "0");
    if (isNaN(raw) || raw < 0) {
      toast.error("Enter a valid percentage");
      return;
    }
    const bps = Math.round(raw * 100);
    const current = settings[key];
    if (bps === current) return;

    const updated: Omit<OverheadSettings, "id"> = {
      laborOhBps: settings.laborOhBps,
      laborBurdenBps: settings.laborBurdenBps,
      contractOhBps: settings.contractOhBps,
      equipmentOhBps: settings.equipmentOhBps,
      materialsOhBps: settings.materialsOhBps,
      otherOhBps: settings.otherOhBps,
      flatOverheadRateBps: settings.flatOverheadRateBps,
      [key]: bps,
    };

    try {
      await upsert(updated);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400 py-2">Loading…</p>;
  }

  function renderField(f: FieldConfig) {
    return (
      <div key={f.key} className="flex flex-col gap-1.5">
        <Label htmlFor={`oh-${f.key}`} className="text-xs">
          {f.label}
        </Label>
        <div className="relative">
          <Input
            id={`oh-${f.key}`}
            type="number"
            min="0"
            step="0.01"
            className="pr-8 text-sm"
            value={drafts[f.key] ?? "0"}
            onChange={(e) =>
              setDrafts((prev) => ({ ...prev, [f.key]: e.target.value }))
            }
            onBlur={() => void handleBlur(f.key)}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            %
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        These percentages are applied per cost type when calculating estimate overhead recovery.
        If any of them is above 0%, they take over for every estimate and the flat rate below is ignored.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(renderField)}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs text-slate-500">
          Used only when none of the per-cost-type percentages above are set. Pre-fills new estimates&apos;
          own Overhead Rate % automatically, so it doesn&apos;t have to be typed in on every estimate — still
          editable per estimate afterward.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {renderField(FLAT_RATE_FIELD)}
        </div>
      </div>
    </div>
  );
}
