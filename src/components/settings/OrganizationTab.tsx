"use client";

import { useEffect, useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingRow } from "@/components/settings/settings-ui";
import { useSettingsStore } from "@/stores/settings-store";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";

// General organization settings — name, address, tax rate, and labor rates.
// Branding (logo/accent color) lives in BrandingTab; the maintenance-request
// portal toggle lives in Equipt settings (it's an Equipt-specific feature).
// This is the master-account "Organization" tab.
export function OrganizationTab() {
  const {
    orgName,
    setOrgName,
    companyAddress,
    setCompanyAddress,
    taxRatePercent,
    setTaxRatePercent,
    breakevenLaborRateCents,
    setBreakevenLaborRateCents,
    burdenedLaborRateCents,
    setBurdenedLaborRateCents,
  } = useSettingsStore();

  const { data: remoteSettings } = useOrgSettings();
  const { mutate: updateOrgSettings, isPending: savingSettings } = useUpdateOrgSettings();
  const [addressSaved, setAddressSaved] = useState(false);

  const [taxDraft, setTaxDraft] = useState(taxRatePercent);
  const [breakevenDraft, setBreakevenDraft] = useState((breakevenLaborRateCents / 100).toFixed(2));
  const [burdenedDraft, setBurdenedDraft] = useState((burdenedLaborRateCents / 100).toFixed(2));
  const [orgNameDraft, setOrgNameDraft] = useState(orgName);

  // The Save buttons below must compare against what's ACTUALLY persisted in
  // organizations.customizations, not the zustand store's value — the store
  // ships with hardcoded placeholder defaults (6927 / 5200, i.e. "$69.27" /
  // "$52.00") that are never written to the DB on their own. If an org has
  // never saved a rate, typing the exact same number the placeholder already
  // shows made this comparison see "no change" and permanently disable Save,
  // so the rate looked configured in the UI but never actually reached the
  // database (and estimate line item cost auto-fill, which reads the DB
  // value, never saw it).
  const remoteCustomizations = (remoteSettings?.customizations as Record<string, unknown>) ?? {};
  const persistedBreakevenCents =
    typeof remoteCustomizations.breakevenLaborRateCents === "number" ? remoteCustomizations.breakevenLaborRateCents : -1;
  const persistedBurdenedCents =
    typeof remoteCustomizations.burdenedLaborRateCents === "number" ? remoteCustomizations.burdenedLaborRateCents : -1;

  const seeded = useRef(false);
  useEffect(() => {
    if (!remoteSettings || seeded.current) return;
    seeded.current = true;
    setOrgNameDraft(remoteSettings.name);
    setTaxDraft(remoteSettings.taxRatePercent);
    const savedRate = (remoteSettings.customizations as Record<string, unknown>)?.breakevenLaborRateCents;
    if (typeof savedRate === "number") setBreakevenDraft((savedRate / 100).toFixed(2));
    const savedBurdened = (remoteSettings.customizations as Record<string, unknown>)?.burdenedLaborRateCents;
    if (typeof savedBurdened === "number") setBurdenedDraft((savedBurdened / 100).toFixed(2));
  }, [remoteSettings, seeded]);

  return (
    <div className="flex flex-col gap-6">
      {/* Organization */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Organization</h2>
          <p className="mt-0.5 text-xs text-slate-500">General settings for {orgName}</p>
        </div>
        <Separator />
        <div className="px-6">
          {/* Organization name */}
          <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Organization Name</p>
              <p className="mt-0.5 text-xs text-slate-500">Your company name as it appears across the platform</p>
            </div>
            <div className="flex w-full gap-2 md:w-80 md:shrink-0">
              <Input
                value={orgNameDraft}
                onChange={(e) => setOrgNameDraft(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                disabled={orgNameDraft.trim() === orgName || !orgNameDraft.trim()}
                onClick={() => {
                  setOrgName(orgNameDraft.trim());
                  updateOrgSettings({ name: orgNameDraft.trim() });
                }}
              >
                Save
              </Button>
            </div>
          </div>
          <Separator />
          {/* Company address */}
          <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Company Address</p>
              <p className="mt-0.5 text-xs text-slate-500">Printed in the header of purchase orders</p>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-80 md:shrink-0">
              <Input
                placeholder="Street address"
                value={companyAddress.street}
                onChange={(e) => setCompanyAddress({ street: e.target.value })}
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={companyAddress.city}
                  onChange={(e) => setCompanyAddress({ city: e.target.value })}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="State"
                  value={companyAddress.state}
                  onChange={(e) => setCompanyAddress({ state: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="ZIP"
                  value={companyAddress.zip}
                  onChange={(e) => setCompanyAddress({ zip: e.target.value })}
                  className="h-8 w-24 shrink-0 text-sm"
                />
                <Input
                  placeholder="Phone"
                  value={companyAddress.phone}
                  onChange={(e) => setCompanyAddress({ phone: e.target.value })}
                  className="h-8 flex-1 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="h-8 w-full"
                disabled={savingSettings}
                onClick={() => {
                  setAddressSaved(false);
                  updateOrgSettings(
                    { address: companyAddress },
                    {
                      onSuccess: () => {
                        setAddressSaved(true);
                        setTimeout(() => setAddressSaved(false), 2000);
                      },
                    }
                  );
                }}
              >
                {savingSettings ? "Saving..." : addressSaved ? "Saved!" : "Save Address"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Finance */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Finance</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tax and currency defaults applied to new requisitions and purchase orders
          </p>
        </div>
        <Separator />
        <div className="px-6">
          <SettingRow
            label="Default Sales Tax Rate"
            description="Applied to new POs and requisitions. Can be overridden per record."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={taxDraft}
                onChange={(e) => setTaxDraft(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-500">%</span>
              <Button
                size="sm"
                className="h-8"
                disabled={taxDraft === taxRatePercent}
                onClick={() => {
                  setTaxRatePercent(taxDraft);
                  updateOrgSettings({ taxRatePercent: taxDraft });
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Breakeven Labor Rate"
            description="Fully-loaded cost per labor hour — wages + burden + non-billable uplift + fixed overhead recovery. Used in Job Costing and Project net profit (full rate)."
          >
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
          </SettingRow>
          <SettingRow
            label="Burdened Labor Rate"
            description="Wages + burden + non-billable uplift only — no fixed overhead recovery. Shows project net profit before overhead absorption."
          >
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
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
