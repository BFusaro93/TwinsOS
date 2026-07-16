"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Plus, Trash2 } from "lucide-react";
import {
  calcAutoQuantity,
  useChemicalApplicationRates,
  useChemicalApplicationsForVisit,
  useChemicalLookupItems,
  useChemicalSettings,
  useDeleteChemicalApplication,
  useSaveChemicalApplication,
} from "@/lib/hooks/use-chemical-tracking";
import { useProducts } from "@/lib/hooks/use-products";
import { useEmployees } from "@/lib/hooks/use-employees";
import { usePropertyCustomFieldValues } from "@/lib/hooks/use-rate-matrix";
import { SendApplicationNoticeDialog } from "./SendApplicationNoticeDialog";
import type { ChemicalApplication } from "@/types/chemical-tracking";

interface Props {
  jobId: string;
  visitId: string;
  propertyId?: string | null;
}

function MultiCheck({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return <p className="text-xs text-slate-400">None configured</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.id}
          className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs cursor-pointer"
        >
          <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => onToggle(o.id)} />
          {o.name}
        </label>
      ))}
    </div>
  );
}

function ApplicationRow({
  application,
  jobId,
  visitId,
  productName,
  methods,
  units,
  targets,
  areasTreated,
  employees,
}: {
  application: ChemicalApplication;
  jobId: string;
  visitId: string;
  productName: string;
  methods: { id: string; name: string }[];
  units: { id: string; name: string }[];
  targets: { id: string; name: string }[];
  areasTreated: { id: string; name: string }[];
  employees: { id: string; name: string; applicatorLicense: string | null }[];
}) {
  const save = useSaveChemicalApplication();
  const del = useDeleteChemicalApplication();
  const [chemicalAmount, setChemicalAmount] = useState(application.chemicalAmount?.toString() ?? "");
  const [solutionAmount, setSolutionAmount] = useState(application.solutionAmount?.toString() ?? "");
  const [unitOfMeasureId, setUnitOfMeasureId] = useState(application.unitOfMeasureId ?? "");
  const [applicationMethodId, setApplicationMethodId] = useState(application.applicationMethodId ?? "");
  const [targetIds, setTargetIds] = useState<string[]>(application.targetIds);
  const [areasTreatedIds, setAreasTreatedIds] = useState<string[]>(application.areasTreatedIds);
  const [used, setUsed] = useState(application.used);
  const [applicatorEmployeeId, setApplicatorEmployeeId] = useState(application.applicatorEmployeeId ?? "");
  const [notes, setNotes] = useState(application.notes ?? "");

  function toggleTarget(id: string) {
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }
  function toggleArea(id: string) {
    setAreasTreatedIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function handleSave() {
    const employee = employees.find((e) => e.id === applicatorEmployeeId);
    save.mutate({
      id: application.id,
      jobId,
      visitId,
      productId: application.productId,
      chemicalAmount: chemicalAmount ? parseFloat(chemicalAmount) : null,
      solutionAmount: solutionAmount ? parseFloat(solutionAmount) : null,
      unitOfMeasureId: unitOfMeasureId || null,
      applicationMethodId: applicationMethodId || null,
      targetIds,
      areasTreatedIds,
      used,
      applicatorEmployeeId: applicatorEmployeeId || null,
      applicatorLicenseNumber: employee?.applicatorLicense ?? null,
      notes: notes || null,
    });
  }

  return (
    <div className="rounded-md border p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{productName}</span>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={used} onCheckedChange={(v) => setUsed(v === true)} />
            <span className={used ? "text-green-600" : "text-red-500"}>{used ? "Used" : "Not used"}</span>
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-slate-400 hover:text-red-500"
          onClick={() => del.mutate({ id: application.id, visitId })}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-slate-500">Chemical Amt</label>
          <Input
            className="h-8 text-xs"
            type="number"
            step="any"
            value={chemicalAmount}
            onChange={(e) => setChemicalAmount(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-slate-500">Solution Amt</label>
          <Input
            className="h-8 text-xs"
            type="number"
            step="any"
            value={solutionAmount}
            onChange={(e) => setSolutionAmount(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-slate-500">Unit</label>
          <Select value={unitOfMeasureId || "none"} onValueChange={(v) => setUnitOfMeasureId(v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-slate-500">Application Method</label>
        <Select value={applicationMethodId || "none"} onValueChange={(v) => setApplicationMethodId(v === "none" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {methods.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-slate-500">Target</label>
        <MultiCheck options={targets} selected={targetIds} onToggle={toggleTarget} />
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-slate-500">Areas Treated</label>
        <MultiCheck options={areasTreated} selected={areasTreatedIds} onToggle={toggleArea} />
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-slate-500">Applicator</label>
        <Select
          value={applicatorEmployeeId || "none"}
          onValueChange={(v) => setApplicatorEmployeeId(v === "none" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select applicator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
                {e.applicatorLicense ? ` (Lic. ${e.applicatorLicense})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-slate-500">Notes</label>
        <Textarea rows={2} className="text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/** Per-visit chemical application logging — the compliance-critical record. */
export function ChemicalApplicationPanel({ jobId, visitId, propertyId }: Props) {
  const { data: applications = [] } = useChemicalApplicationsForVisit(visitId);
  const { data: allProducts = [] } = useProducts();
  const { data: methods = [] } = useChemicalLookupItems("application_method");
  const { data: units = [] } = useChemicalLookupItems("volume_unit");
  const { data: targets = [] } = useChemicalLookupItems("target");
  const { data: areasTreated = [] } = useChemicalLookupItems("areas_treated");
  const { data: employeesRaw = [] } = useEmployees();
  const { data: settings } = useChemicalSettings();
  const saveApplication = useSaveChemicalApplication();

  const [addingProductId, setAddingProductId] = useState("");
  const { data: addingProductRates = [] } = useChemicalApplicationRates(addingProductId || undefined);
  const { data: propertyFieldValues = [] } = usePropertyCustomFieldValues(propertyId ?? "");

  const employees = employeesRaw.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`.trim(),
    applicatorLicense: e.applicatorLicense,
  }));

  const chemicalProducts = allProducts.filter((p) => p.trackChemicals && !p.deletedAt);
  const [noticeDialogOpen, setNoticeDialogOpen] = useState(false);

  const [temperature, setTemperature] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [windDirection, setWindDirection] = useState("");
  const [phLevel, setPhLevel] = useState("");

  useEffect(() => {
    const first = applications[0];
    if (first) {
      setTemperature(first.temperature?.toString() ?? "");
      setWindSpeed(first.windSpeed?.toString() ?? "");
      setWindDirection(first.windDirection ?? "");
      setPhLevel(first.phLevel?.toString() ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications.length]);

  const showWeather = settings?.conditionsDisplay === "weather" || settings?.conditionsDisplay === "both";
  const showPh = settings?.conditionsDisplay === "ph" || settings?.conditionsDisplay === "both";

  function handleAdd() {
    if (!addingProductId) return;

    let chemicalAmount: number | null | undefined;
    let unitOfMeasureId: string | null | undefined;
    let applicationMethodId: string | null | undefined;

    if (settings?.autoCalcQuantity && settings.areaCustomFieldId) {
      const defaultRate = addingProductRates.find((r) => r.isDefault) ?? addingProductRates[0];
      const areaValue = propertyFieldValues.find(
        (v) => v.fieldDefId === settings.areaCustomFieldId
      )?.valueNumber;
      if (defaultRate && areaValue != null) {
        const computed = calcAutoQuantity(defaultRate, areaValue);
        if (computed != null) {
          chemicalAmount = Math.round(computed * 10000) / 10000;
          unitOfMeasureId = defaultRate.unitOfMeasureId;
          applicationMethodId = defaultRate.applicationMethodId;
        }
      }
    }

    saveApplication.mutate({
      jobId,
      visitId,
      productId: addingProductId,
      used: true,
      ...(chemicalAmount !== undefined && { chemicalAmount }),
      ...(unitOfMeasureId !== undefined && { unitOfMeasureId }),
      ...(applicationMethodId !== undefined && { applicationMethodId }),
    });
    setAddingProductId("");
  }

  function applyConditionsToAll() {
    applications.forEach((a) => {
      saveApplication.mutate({
        id: a.id,
        jobId,
        visitId,
        temperature: temperature ? parseFloat(temperature) : null,
        windSpeed: windSpeed ? parseFloat(windSpeed) : null,
        windDirection: windDirection || null,
        phLevel: phLevel ? parseFloat(phLevel) : null,
      });
    });
  }

  const linkable = chemicalProducts.filter((p) => !applications.some((a) => a.productId === p.id));

  return (
    <div className="flex flex-col gap-3">
      {applications.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setNoticeDialogOpen(true)}
          >
            <Mail className="h-3.5 w-3.5" /> Send Notice
          </Button>
        </div>
      )}
      <SendApplicationNoticeDialog
        visitId={visitId}
        open={noticeDialogOpen}
        onClose={() => setNoticeDialogOpen(false)}
        onSent={() => setNoticeDialogOpen(false)}
      />
      {(showWeather || showPh) && applications.length > 0 && (
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Conditions</p>
          <div className="grid grid-cols-4 gap-2">
            {showWeather && (
              <>
                <div className="grid gap-1">
                  <label className="text-xs text-slate-500">Temp (°F)</label>
                  <Input className="h-8 text-xs" type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-slate-500">Wind Speed</label>
                  <Input className="h-8 text-xs" type="number" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-slate-500">Wind Direction</label>
                  <Input className="h-8 text-xs" value={windDirection} onChange={(e) => setWindDirection(e.target.value)} placeholder="e.g. NW" />
                </div>
              </>
            )}
            {showPh && (
              <div className="grid gap-1">
                <label className="text-xs text-slate-500">pH Level</label>
                <Input className="h-8 text-xs" type="number" step="0.1" value={phLevel} onChange={(e) => setPhLevel(e.target.value)} />
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyConditionsToAll}>
              Apply to all chemicals on this visit
            </Button>
          </div>
        </div>
      )}

      {applications.length === 0 && (
        <p className="text-xs text-slate-400">No chemical applications logged for this visit yet.</p>
      )}

      {applications.map((a) => (
        <ApplicationRow
          key={a.id}
          application={a}
          jobId={jobId}
          visitId={visitId}
          productName={a.productName ?? "Unknown chemical"}
          methods={methods}
          units={units}
          targets={targets}
          areasTreated={areasTreated}
          employees={employees}
        />
      ))}

      <div className="flex items-center gap-2">
        <Select value={addingProductId || "none"} onValueChange={(v) => setAddingProductId(v === "none" ? "" : v)}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue placeholder="Select a chemical product…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select a chemical product…</SelectItem>
            {linkable.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!addingProductId}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Chemical
        </Button>
      </div>
    </div>
  );
}
