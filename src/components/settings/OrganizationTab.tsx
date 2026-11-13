"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/shared/useConfirm";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/settings-ui";
import { useSettingsStore } from "@/stores/settings-store";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { DEFAULT_TIME_ZONE, SELECTABLE_TIME_ZONES } from "@/lib/time/zone";
import { ApplyRatesToProjectsDialog } from "@/components/shared/ApplyRatesToProjectsDialog";
import { ApplyTaxRateToClientsDialog } from "@/components/shared/ApplyTaxRateToClientsDialog";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { parseOvertimeRule, type OvertimeMode } from "@/lib/payroll/overtime";

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
  const [confirm, confirmDialog] = useConfirm();
  // Every save says whether it worked: these used to fail silently (e.g. a role the org-update
  // policy refuses) and the old value came back on reload.
  const saveFeedback = (label: string, onSuccess?: () => void) => ({
    onSuccess: () => {
      toast.success(`${label} saved`);
      onSuccess?.();
    },
    onError: (err: unknown) => toast.error(err instanceof Error && err.message ? err.message : `Failed to save ${label.toLowerCase()}`),
  });
  const [addressSaved, setAddressSaved] = useState(false);
  // After a labor rate is saved: offer to also update open projects.
  const [ratesPrompt, setRatesPrompt] = useState<{ full: number; burdened: number } | null>(null);
  // After the tax rate is saved: offer to move clients still at the old rate.
  const [taxPrompt, setTaxPrompt] = useState<{ from: number; to: number } | null>(null);

  const [taxDraft, setTaxDraft] = useState(taxRatePercent);
  const [breakevenDraft, setBreakevenDraft] = useState((breakevenLaborRateCents / 100).toFixed(2));
  const [burdenedDraft, setBurdenedDraft] = useState((burdenedLaborRateCents / 100).toFixed(2));
  const [orgNameDraft, setOrgNameDraft] = useState(orgName);
  const [replyToDraft, setReplyToDraft] = useState("");
  // Seeded from the platform default until the org row loads, then synced in
  // the effect below alongside the other remote-backed drafts.
  const [tzDraft, setTzDraft] = useState<string>(DEFAULT_TIME_ZONE);

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

  // Mirrors isUsableReplyTo on the server — the save is rejected there too,
  // this is only so the error shows before a round trip.
  const replyToValid = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(replyToDraft.trim());

  // Overtime rule for the Payroll tab (customizations.overtime). Defaults: weekly over 40.
  const persistedOvertime = parseOvertimeRule(remoteCustomizations);
  const [otModeDraft, setOtModeDraft] = useState<OvertimeMode>(persistedOvertime.mode);
  const [otWeeklyDraft, setOtWeeklyDraft] = useState(String(persistedOvertime.weeklyHours));
  const [otDailyDraft, setOtDailyDraft] = useState(String(persistedOvertime.dailyHours));
  const otWeekly = Number(otWeeklyDraft);
  const otDaily = Number(otDailyDraft);
  const otValid = otModeDraft === "daily"
    ? Number.isFinite(otDaily) && otDaily > 0 && otDaily <= 24
    : Number.isFinite(otWeekly) && otWeekly > 0 && otWeekly <= 168;
  const otDirty =
    otModeDraft !== persistedOvertime.mode ||
    (otModeDraft === "weekly" ? otWeekly !== persistedOvertime.weeklyHours : otDaily !== persistedOvertime.dailyHours);

  const seeded = useRef(false);
  useEffect(() => {
    if (!remoteSettings || seeded.current) return;
    seeded.current = true;
    setOrgNameDraft(remoteSettings.name);
    setReplyToDraft(remoteSettings.replyToEmail ?? "");
    setTaxDraft(remoteSettings.taxRatePercent);
    setTzDraft(remoteSettings.timezone);
    const savedRate = (remoteSettings.customizations as Record<string, unknown>)?.breakevenLaborRateCents;
    if (typeof savedRate === "number") setBreakevenDraft((savedRate / 100).toFixed(2));
    const savedBurdened = (remoteSettings.customizations as Record<string, unknown>)?.burdenedLaborRateCents;
    if (typeof savedBurdened === "number") setBurdenedDraft((savedBurdened / 100).toFixed(2));
    const savedOvertime = parseOvertimeRule(remoteSettings.customizations);
    setOtModeDraft(savedOvertime.mode);
    setOtWeeklyDraft(String(savedOvertime.weeklyHours));
    setOtDailyDraft(String(savedOvertime.dailyHours));
  }, [remoteSettings, seeded]);

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      {/* Organization */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Organization</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">General settings for {orgName}</p>
        </div>
        <Separator />
        <div className="px-6">
          {/* Organization name */}
          <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">Organization Name</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Your company name as it appears across the platform</p>
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
                  const name = orgNameDraft.trim();
                  updateOrgSettings({ name }, saveFeedback("Organization name", () => setOrgName(name)));
                }}
              >
                Save
              </Button>
            </div>
          </div>
          <Separator />
          {/* Reply-To — see lib/email/reply-to.ts for why this is Reply-To
              and not From. */}
          <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">Reply-To Email</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Where a client&rsquo;s reply goes when they answer an invoice, estimate or
                automated email. Emails still send from your company name on our sending
                domain; only the reply address changes. Leave blank and replies go nowhere.
              </p>
            </div>
            <div className="flex w-full flex-col gap-1 md:w-80 md:shrink-0">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="office@yourcompany.com"
                  value={replyToDraft}
                  onChange={(e) => setReplyToDraft(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={
                    savingSettings ||
                    replyToDraft.trim() === (remoteSettings?.replyToEmail ?? "") ||
                    (!!replyToDraft.trim() && !replyToValid)
                  }
                  onClick={() => updateOrgSettings({ replyToEmail: replyToDraft.trim() || null }, saveFeedback("Reply-to email"))}
                >
                  Save
                </Button>
              </div>
              {!!replyToDraft.trim() && !replyToValid && (
                <p className="text-[11px] text-red-600 dark:text-red-400">Enter a valid email address.</p>
              )}
            </div>
          </div>
          <Separator />
          {/* Company address */}
          <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">Company Address</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Printed in the header of purchase orders</p>
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
                      onError: (err) => toast.error(err instanceof Error && err.message ? err.message : "Failed to save address"),
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
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Finance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Time zone, tax and labor-rate defaults for the whole company
          </p>
        </div>
        <Separator />
        <div className="px-6">
          <SettingRow
            label="Operating Time Zone"
            description="The clock your business runs on. Decides which day a visit, invoice or report belongs to — for everyone, including staff logged in from another time zone."
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={tzDraft}
                onChange={(e) => setTzDraft(e.target.value)}
                className="min-w-0 rounded-md border border-slate-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {SELECTABLE_TIME_ZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
                {/* An org set to something outside the shortlist (directly in
                    the DB) must still see its own value selected rather than
                    silently reading as Eastern. */}
                {!SELECTABLE_TIME_ZONES.some((t) => t.value === tzDraft) && (
                  <option value={tzDraft}>{tzDraft}</option>
                )}
              </select>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                Now {new Date().toLocaleTimeString("en-US", {
                  timeZone: tzDraft,
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <Button
                size="sm"
                className="h-8"
                disabled={savingSettings || tzDraft === (remoteSettings?.timezone ?? "")}
                onClick={async () => {
                  // The org's clock decides which day every visit, invoice and report belongs to.
                  const ok = await confirm({
                    title: "Change the operating time zone?",
                    description: `"Today" for the dispatch board, crew app, billing runs and reports will follow ${tzDraft} from now on. Visits already scheduled keep their dates.`,
                    confirmLabel: "Change time zone",
                  });
                  if (!ok) return;
                  updateOrgSettings({ timezone: tzDraft }, saveFeedback("Time zone"));
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Default Sales Tax Rate"
            description="One rate for the whole company: the default on new invoices and estimates (Landscapt) and on new POs and requisitions (Equipt). Can be overridden per record."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={taxDraft}
                onChange={(e) => setTaxDraft(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-md border border-slate-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                size="sm"
                className="h-8"
                disabled={taxDraft === taxRatePercent}
                onClick={() => {
                  const previous = taxRatePercent;
                  const next = taxDraft;
                  updateOrgSettings(
                    { taxRatePercent: next },
                    saveFeedback("Default tax rate", () => {
                      setTaxRatePercent(next);
                      if (previous !== next) setTaxPrompt({ from: previous, to: next });
                    })
                  );
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Break-Even Labor Rate"
            description="Fully-loaded cost per labor hour — wages + burden + non-billable uplift + fixed overhead recovery (LLR + Overhead). Used in Job Costing and Project net profit (break-even)."
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={breakevenDraft}
                onChange={(e) => setBreakevenDraft(e.target.value)}
                className="w-24 rounded-md border border-slate-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm text-muted-foreground">/hr</span>
              <Button
                size="sm"
                className="h-8"
                disabled={Math.round(parseFloat(breakevenDraft) * 100) === persistedBreakevenCents}
                onClick={() => {
                  const cents = Math.round((parseFloat(breakevenDraft) || 0) * 100);
                  setBreakevenLaborRateCents(cents);
                  updateOrgSettings(
                    { customizations: { breakevenLaborRateCents: cents } },
                    saveFeedback("Break-even labor rate", () => setRatesPrompt({ full: cents, burdened: burdenedLaborRateCents })),
                  );
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Loaded Labor Rate (LLR)"
            description="Wages + burden + non-billable uplift only — no fixed overhead recovery. Shows project net profit before overhead absorption."
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={burdenedDraft}
                onChange={(e) => setBurdenedDraft(e.target.value)}
                className="w-24 rounded-md border border-slate-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm text-muted-foreground">/hr</span>
              <Button
                size="sm"
                className="h-8"
                disabled={Math.round(parseFloat(burdenedDraft) * 100) === persistedBurdenedCents}
                onClick={() => {
                  const cents = Math.round((parseFloat(burdenedDraft) || 0) * 100);
                  setBurdenedLaborRateCents(cents);
                  updateOrgSettings(
                    { customizations: { burdenedLaborRateCents: cents } },
                    saveFeedback("Loaded labor rate", () => setRatesPrompt({ full: breakevenLaborRateCents, burdened: cents })),
                  );
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Crew pauses are unpaid"
            description="When a crew pauses a stop (lunch, a break), that time is deducted from their pay and paid labor cost. Turn off to pay for pauses. Hours worked are always net of pauses. The office can override this per visit on the dispatch board. Each day keeps the setting it ended under, so a change applies to days ended from now on — past and locked pay periods are not re-priced."
          >
            <Switch
              checked={remoteCustomizations.crewBreaksUnpaid !== false}
              disabled={savingSettings}
              onCheckedChange={(checked) => updateOrgSettings({ customizations: { crewBreaksUnpaid: checked } }, saveFeedback("Crew pause setting"))}
              aria-label="Crew pauses are unpaid"
            />
          </SettingRow>
          <SettingRow
            label="Overtime"
            description="How the Payroll tab and its exports split each person's paid hours into regular and overtime (OT). Weekly counts hours over the limit in a Monday–Sunday week; daily counts hours over the limit in one day. Extra hours added on the Payroll tab count toward it."
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={otModeDraft}
                onChange={(e) => setOtModeDraft(e.target.value === "daily" ? "daily" : "weekly")}
                aria-label="Overtime rule"
                className="min-w-0 rounded-md border border-slate-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="weekly">Over hours per week</option>
                <option value="daily">Over hours per day</option>
              </select>
              <input
                type="number"
                min={1}
                max={otModeDraft === "daily" ? 24 : 168}
                step={0.5}
                value={otModeDraft === "daily" ? otDailyDraft : otWeeklyDraft}
                onChange={(e) => (otModeDraft === "daily" ? setOtDailyDraft(e.target.value) : setOtWeeklyDraft(e.target.value))}
                aria-label={otModeDraft === "daily" ? "Overtime after hours per day" : "Overtime after hours per week"}
                className="w-20 rounded-md border border-slate-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm text-muted-foreground">hrs</span>
              <Button
                size="sm"
                className="h-8"
                disabled={savingSettings || !otValid || !otDirty}
                onClick={() =>
                  updateOrgSettings(
                    {
                      customizations: {
                        overtime: {
                          mode: otModeDraft,
                          weeklyHours: otModeDraft === "weekly" ? otWeekly : persistedOvertime.weeklyHours,
                          dailyHours: otModeDraft === "daily" ? otDaily : persistedOvertime.dailyHours,
                        },
                      },
                    },
                    saveFeedback("Overtime rule")
                  )
                }
              >
                Save
              </Button>
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Change history — every edit to these settings (who, when, old → new). */}
      {remoteSettings?.id && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="px-6 py-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Change history</h3>
            <p className="text-xs text-muted-foreground">
              Every change to these organization settings, including labor rates. Visible to admins and managers.
            </p>
          </div>
          <Separator />
          <div className="max-h-96 overflow-y-auto">
            <AuditTrailTab recordType="organization" recordId={remoteSettings.id} />
          </div>
        </div>
      )}

      <ApplyTaxRateToClientsDialog
        previousPercent={taxPrompt?.from ?? null}
        newPercent={taxPrompt?.to ?? 0}
        onClose={() => setTaxPrompt(null)}
      />

      {ratesPrompt && (
        <ApplyRatesToProjectsDialog
          open
          onOpenChange={(o) => {
            if (!o) setRatesPrompt(null);
          }}
          laborRateCents={ratesPrompt.full}
          burdenedRateCents={ratesPrompt.burdened}
        />
      )}
    </div>
  );
}
