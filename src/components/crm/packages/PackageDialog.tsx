"use client";

import { useState, useEffect } from "react";
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
  useCreatePackage, useUpdatePackage,
  useUpsertPackageService, useDeletePackageService,
} from "@/lib/hooks/use-packages";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import type { CRMPackage } from "@/types/crm-packages";

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
  pkg: CRMPackage | null;
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

export function PackageDialog({ open, pkg, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("details");
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: services = [] } = useCRMServices();
  const createPkg = useCreatePackage();
  const updatePkg = useUpdatePackage();
  const upsertSvc = useUpsertPackageService();
  const deleteSvc = useDeletePackageService();

  // new service row being added
  const [newServiceId, setNewServiceId] = useState("");
  const [newVisits, setNewVisits] = useState("1");

  useEffect(() => {
    if (open) {
      setTab("details");
      setForm(pkg ? pkgToForm(pkg) : emptyForm());
      setNewServiceId("");
      setNewVisits("1");
    }
  }, [open, pkg]);

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
      visits_per_season: parseInt(form.visitsPerSeason) || 1,
      schedule_frequency: form.scheduleFrequency,
      schedule_days: form.scheduleDays,
      is_active: form.isActive,
    };
    try {
      if (pkg) {
        await updatePkg.mutateAsync({ id: pkg.id, patch });
      } else {
        await createPkg.mutateAsync(patch);
      }
      toast.success(pkg ? "Package updated" : "Package created");
      onClose();
    } catch {
      toast.error("Failed to save package");
    }
  }

  async function handleAddService() {
    if (!pkg || !newServiceId) return;
    const svc = services.find((s) => s.id === newServiceId);
    if (!svc) return;
    try {
      await upsertSvc.mutateAsync({
        packageId: pkg.id,
        row: {
          service_id: svc.id,
          service_name: svc.name,
          visits_included: parseInt(newVisits) || 1,
          sort_order: (pkg.services?.length ?? 0),
        },
      });
      setNewServiceId("");
      setNewVisits("1");
    } catch {
      toast.error("Failed to add service");
    }
  }

  const isPending = createPkg.isPending || updatePkg.isPending;
  const totalAnnual = Math.round((parseFloat(form.monthlyAmountCents) || 0) * 100) * (parseInt(form.seasonMonths) || 12);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <Input type="number" value={form.visitsPerSeason}
                    onChange={(e) => setForm({ ...form, visitsPerSeason: e.target.value })}
                    min="1" className="text-sm" />
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
              Define which services are included in this package and how many visits of each are covered per season.
            </p>

            {/* Existing services */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Service</th>
                    <th className="px-4 py-2.5 text-center">Visits Included</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {(pkg.services ?? []).length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-sm">No services added yet.</td></tr>
                  )}
                  {(pkg.services ?? []).map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{s.serviceName}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{s.visitsIncluded}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => deleteSvc.mutate(s.id)}
                          className="rounded p-0.5 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add service row */}
            <div className="flex items-end gap-2 rounded-lg border bg-slate-50 p-3">
              <div className="flex-1 flex flex-col gap-1">
                <Label className="text-xs text-slate-500">Service</Label>
                <Select value={newServiceId} onValueChange={setNewServiceId}>
                  <SelectTrigger className="text-sm bg-white"><SelectValue placeholder="Pick a service…" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28 flex flex-col gap-1">
                <Label className="text-xs text-slate-500">Visits</Label>
                <Input type="number" min="1" value={newVisits}
                  onChange={(e) => setNewVisits(e.target.value)} className="text-sm bg-white" />
              </div>
              <Button size="sm" onClick={handleAddService}
                disabled={!newServiceId || upsertSvc.isPending}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
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
