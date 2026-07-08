"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  usePackages, useCreatePackage, useUpdatePackage,
  useUpsertPackageService, useDeletePackageService,
} from "@/lib/hooks/use-packages";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { computePackageVisitSchedule, type PackageVisitSchedule } from "@/lib/package-schedule";
import type { CRMPackage, CRMPackageService } from "@/types/crm-packages";
import type { CRMService } from "@/types/crm-jobs";

const FREQ_OPTIONS = [
  { value: "weekly",    label: "Weekly" },
  { value: "biweekly",  label: "Bi-weekly" },
  { value: "monthly",   label: "Monthly" },
  { value: "as_needed", label: "As Needed" },
  { value: "custom",    label: "Custom" },
];

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

type Tab = "details" | "services";

interface Props {
  open: boolean;
  packageId: string | null;
  onClose: () => void;
}

interface FormState {
  name: string;
  code: string;
  description: string;
  monthlyAmountCents: string;
  seasonMonths: string;
  visitsPerSeason: string;
  scheduleFrequency: string;
  scheduleDays: string[];
  isActive: boolean;
}

function emptyForm(): FormState {
  return {
    name: "", code: "", description: "",
    monthlyAmountCents: "", seasonMonths: "12",
    visitsPerSeason: "1", scheduleFrequency: "as_needed",
    scheduleDays: [], isActive: true,
  };
}

function pkgToForm(p: CRMPackage): FormState {
  return {
    name: p.name,
    code: p.code ?? "",
    description: p.description ?? "",
    monthlyAmountCents: p.monthlyAmountCents > 0 ? (p.monthlyAmountCents / 100).toFixed(2) : "",
    seasonMonths: String(p.seasonMonths),
    visitsPerSeason: String(p.visitsPerSeason),
    scheduleFrequency: p.scheduleFrequency,
    scheduleDays: p.scheduleDays ?? [],
    isActive: p.isActive,
  };
}

// ── PackageServiceRow ────────────────────────────────────────────────────────
// One numbered visit in the program — every field saves independently
// (on blur for text/number, on change for date/select) rather than requiring
// a separate save step, matching how other inline-edit lists in this app work.

function PackageServiceRow({
  svc,
  services,
  schedule,
  onDelete,
}: {
  svc: CRMPackageService;
  services: CRMService[];
  schedule: PackageVisitSchedule | null;
  onDelete: () => void;
}) {
  const upsertSvc = useUpsertPackageService();

  const [name, setName] = useState(svc.name ?? "");
  const [serviceId, setServiceId] = useState(svc.serviceId ?? "");
  const [startDate, setStartDate] = useState(svc.startDate ?? "");
  const [endDate, setEndDate] = useState(svc.endDate ?? "");
  const [minDays, setMinDays] = useState(svc.minDays != null ? String(svc.minDays) : "");
  const [defaultBHrs, setDefaultBHrs] = useState(svc.defaultBHrs != null ? String(svc.defaultBHrs) : "");
  const [defaultRate, setDefaultRate] = useState(svc.defaultRateCents != null ? (svc.defaultRateCents / 100).toFixed(2) : "");

  // Sync local drafts when the underlying row changes from elsewhere (e.g. after save)
  useEffect(() => {
    setName(svc.name ?? "");
    setServiceId(svc.serviceId ?? "");
    setStartDate(svc.startDate ?? "");
    setEndDate(svc.endDate ?? "");
    setMinDays(svc.minDays != null ? String(svc.minDays) : "");
    setDefaultBHrs(svc.defaultBHrs != null ? String(svc.defaultBHrs) : "");
    setDefaultRate(svc.defaultRateCents != null ? (svc.defaultRateCents / 100).toFixed(2) : "");
  }, [svc]);

  function save(overrides: Partial<{
    name: string; serviceId: string; startDate: string; endDate: string;
    minDays: string; defaultBHrs: string; defaultRate: string;
  }>) {
    const next = {
      name: overrides.name ?? name,
      serviceId: overrides.serviceId ?? serviceId,
      startDate: overrides.startDate ?? startDate,
      endDate: overrides.endDate ?? endDate,
      minDays: overrides.minDays ?? minDays,
      defaultBHrs: overrides.defaultBHrs ?? defaultBHrs,
      defaultRate: overrides.defaultRate ?? defaultRate,
    };
    const selected = services.find((s) => s.id === next.serviceId);
    upsertSvc.mutate({
      packageId: svc.packageId,
      row: {
        id: svc.id,
        name: next.name.trim() || null,
        service_id: next.serviceId || null,
        service_name: selected?.name ?? svc.serviceName,
        visits_included: svc.visitsIncluded,
        sort_order: svc.sortOrder,
        start_date: next.startDate || null,
        end_date: next.endDate || null,
        min_days: next.minDays !== "" ? parseInt(next.minDays) : null,
        default_b_hrs: next.defaultBHrs !== "" ? parseFloat(next.defaultBHrs) : null,
        default_rate_cents: next.defaultRate !== "" ? Math.round(parseFloat(next.defaultRate) * 100) : null,
      },
    });
  }

  const cellInput = "h-8 text-sm border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-brand-400 rounded";

  return (
    <tr className="border-b last:border-0">
      <td className="px-1 py-1.5">
        <Input value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => save({ name })} className={cellInput} placeholder={`Visit ${svc.sortOrder + 1}`} />
      </td>
      <td className="px-1 py-1.5 min-w-[160px]">
        <Select value={serviceId} onValueChange={(v) => { setServiceId(v); save({ serviceId: v }); }}>
          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1"><SelectValue placeholder="Pick a service…" /></SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-1 py-1.5">
        <Input type="date" value={startDate}
          onChange={(e) => { setStartDate(e.target.value); save({ startDate: e.target.value }); }}
          className={cellInput} />
      </td>
      <td className="px-1 py-1.5">
        <Input type="date" value={endDate}
          onChange={(e) => { setEndDate(e.target.value); save({ endDate: e.target.value }); }}
          className={cellInput} />
      </td>
      <td className="px-1 py-1.5">
        <Input type="number" min="0" value={minDays}
          onChange={(e) => setMinDays(e.target.value)} onBlur={() => save({ minDays })}
          className={`${cellInput} text-center`} />
      </td>
      <td className="px-1 py-1.5">
        <Input type="number" min="0" step="0.1" value={defaultBHrs}
          onChange={(e) => setDefaultBHrs(e.target.value)} onBlur={() => save({ defaultBHrs })}
          className={`${cellInput} text-center`} />
      </td>
      <td className="px-1 py-1.5">
        <Input type="number" min="0" step="0.01" value={defaultRate}
          onChange={(e) => setDefaultRate(e.target.value)} onBlur={() => save({ defaultRate })}
          className={`${cellInput} text-center`} />
      </td>
      <td className="px-3 py-1.5">
        {schedule?.scheduledDate ? (
          <span className={schedule.conflict ? "text-red-600 font-medium" : "text-slate-700"}>
            {schedule.scheduledDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {schedule.conflict && (
              <span className="block text-[10px] font-normal text-red-500">after end date — conflict</span>
            )}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button onClick={onDelete} className="rounded p-0.5 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
        </button>
      </td>
    </tr>
  );
}

export function PackageDialog({ open, packageId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("details");
  const [form, setForm] = useState<FormState>(emptyForm());

  // Re-derived from the live query (not a frozen prop) so the Services table
  // reflects new/edited/deleted rows immediately after each save, instead of
  // only after closing and reopening the dialog.
  const [activePackageId, setActivePackageId] = useState<string | null>(packageId);
  const { data: packages = [] } = usePackages(true);
  const pkg = activePackageId ? packages.find((p) => p.id === activePackageId) ?? null : null;

  // Computed schedule preview: each visit's earliest date that satisfies both
  // its own window and the min-days gap from the previous visit. Recomputes
  // live as dates/min-days are edited.
  const visitSchedule = useMemo(() => computePackageVisitSchedule(pkg?.services ?? []), [pkg?.services]);
  const scheduleByServiceId = useMemo(
    () => new Map(visitSchedule.map((s) => [s.service.id, s])),
    [visitSchedule]
  );

  const { data: services = [] } = useCRMServices();
  const createPkg = useCreatePackage();
  const updatePkg = useUpdatePackage();
  const upsertSvc = useUpsertPackageService();
  const deleteSvc = useDeletePackageService();

  useEffect(() => {
    if (open) {
      setTab("details");
      setActivePackageId(packageId);
      const initial = packageId ? packages.find((p) => p.id === packageId) ?? null : null;
      setForm(initial ? pkgToForm(initial) : emptyForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, packageId]);

  function toggleDay(day: string) {
    setForm((p) => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter((d) => d !== day)
        : [...p.scheduleDays, day],
    }));
  }

  async function handleSave() {
    const patch = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      monthly_amount_cents: Math.round((parseFloat(form.monthlyAmountCents) || 0) * 100),
      season_months: parseInt(form.seasonMonths) || 12,
      visits_per_season: pkg ? (pkg.services?.length || 1) : (parseInt(form.visitsPerSeason) || 1),
      schedule_frequency: form.scheduleFrequency,
      schedule_days: form.scheduleDays,
      is_active: form.isActive,
    };
    try {
      if (pkg) {
        await updatePkg.mutateAsync({ id: pkg.id, patch });
        toast.success("Package updated");
        onClose();
      } else {
        const created = await createPkg.mutateAsync(patch);
        toast.success("Package created — add its services below");
        // Stay open on the newly created package so services can be added
        // right away, instead of requiring a reopen.
        setActivePackageId(created.id);
        setTab("services");
      }
    } catch {
      toast.error("Failed to save package");
    }
  }

  async function handleAddService() {
    if (!pkg || services.length === 0) return;
    const nextIndex = (pkg.services?.length ?? 0) + 1;
    try {
      await upsertSvc.mutateAsync({
        packageId: pkg.id,
        row: {
          name: `Visit ${nextIndex}`,
          service_id: null,
          service_name: "",
          visits_included: 1,
          sort_order: (pkg.services?.length ?? 0),
        },
      });
    } catch {
      toast.error("Failed to add service");
    }
  }

  const isPending = createPkg.isPending || updatePkg.isPending;
  const totalAnnual = Math.round((parseFloat(form.monthlyAmountCents) || 0) * 100) * (parseInt(form.seasonMonths) || 12);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg ? `Edit: ${pkg.name}` : "New Package Program"}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-0 border-b text-sm">
          {([
            { key: "details",  label: "Details" },
            { key: "services", label: `Services (${pkg?.services?.length ?? 0})`, disabled: !pkg },
          ] as { key: Tab; label: string; disabled?: boolean }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => !t.disabled && setTab(t.key)}
              disabled={t.disabled}
              className={`px-4 py-2 border-b-2 font-medium transition-colors
                ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}
                ${t.disabled ? "opacity-40 cursor-not-allowed" : ""}
              `}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Details tab */}
        {tab === "details" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-slate-600">Package Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 7-Step Fertilizer" className="text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-slate-600">Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. FERT7" className="text-sm" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-slate-600">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="text-sm resize-none" />
            </div>

            {/* Billing */}
            <div className="rounded-lg border p-3 flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-600">Billing</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-slate-500">Monthly Amount ($)</Label>
                  <Input type="number" step="0.01" value={form.monthlyAmountCents}
                    onChange={(e) => setForm({ ...form, monthlyAmountCents: e.target.value })}
                    placeholder="0.00" className="text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-slate-500">Season Months</Label>
                  <Input type="number" value={form.seasonMonths}
                    onChange={(e) => setForm({ ...form, seasonMonths: e.target.value })}
                    min="1" max="12" className="text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-slate-500">Annual Total</Label>
                  <p className="text-sm font-semibold text-slate-800 mt-1.5">{formatCurrency(totalAnnual)}</p>
                </div>
              </div>
            </div>

            {/* Visit schedule */}
            <div className="rounded-lg border p-3 flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-600">Visit Schedule</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-slate-500">Visits per Season</Label>
                  {pkg ? (
                    <p className="text-sm font-semibold text-slate-800 mt-1.5">
                      {pkg.services?.length ?? 0} <span className="font-normal text-slate-400">(from Services tab)</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1.5">Add services after creating the package</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-slate-500">Frequency</Label>
                  <Select value={form.scheduleFrequency} onValueChange={(v) => setForm({ ...form, scheduleFrequency: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQ_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(form.scheduleFrequency === "weekly" || form.scheduleFrequency === "biweekly") && (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-slate-500">Days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => (
                      <button key={d} type="button" onClick={() => toggleDay(d)}
                        className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors
                          ${form.scheduleDays.includes(d)
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                          }`}>
                        {d.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} />
              <span className="text-slate-700">Active</span>
            </label>
          </div>
        )}

        {/* Services tab */}
        {tab === "services" && pkg && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-slate-500">
              Each row is one numbered visit in the program (e.g. &ldquo;Visit 1&rdquo; = Step 1 of 5). Give it a
              service, the date window it should fall within, and the minimum days required before the next visit.
              The <span className="font-medium text-slate-600">Scheduled</span> column shows the earliest date each
              visit can actually happen, given its window and the spacing from the visit before it.
            </p>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-left">Name</th>
                    <th className="px-3 py-2.5 text-left">Service</th>
                    <th className="px-3 py-2.5 text-left">Start</th>
                    <th className="px-3 py-2.5 text-left">End</th>
                    <th className="px-3 py-2.5 text-center w-20">Min Days</th>
                    <th className="px-3 py-2.5 text-center w-24">Def. B. Hrs</th>
                    <th className="px-3 py-2.5 text-center w-24">Def. Rate</th>
                    <th className="px-3 py-2.5 text-left w-32">Scheduled</th>
                    <th className="px-3 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {(pkg.services ?? []).length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400 text-sm">No visits added yet.</td></tr>
                  )}
                  {(pkg.services ?? []).map((s) => (
                    <PackageServiceRow
                      key={s.id}
                      svc={s}
                      services={services}
                      schedule={scheduleByServiceId.get(s.id) ?? null}
                      onDelete={() => deleteSvc.mutate(s.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <Button size="sm" variant="outline" onClick={handleAddService}
              disabled={services.length === 0 || upsertSvc.isPending} className="self-start">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Visit
            </Button>
            {services.length === 0 && (
              <p className="text-xs text-amber-600">No services defined yet — add services under CRM Settings → Services first.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
            {isPending ? "Saving…" : pkg ? "Save Changes" : "Create Package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
