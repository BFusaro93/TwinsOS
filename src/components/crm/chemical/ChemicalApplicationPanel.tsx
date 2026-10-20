"use client";

import { useEffect, useRef, useState } from "react";
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
  calcChemicalAndSolution,
  useChemicalApplicationRates,
  useChemicalApplicationsForVisit,
  useChemicalJobAreaValue,
  useLoadServiceChemicals,
  useVisitClockTimes,
  useChemicalLookupItems,
  useChemicalSettings,
  useDeleteChemicalApplication,
  useSaveChemicalApplication,
  useChemicalConfirmationWaived,
  useWaiveChemicalConfirmation,
} from "@/lib/hooks/use-chemical-tracking";
import { useProducts } from "@/lib/hooks/use-products";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { SendApplicationNoticeDialog } from "./SendApplicationNoticeDialog";
import { usePermissions } from "@/lib/hooks/use-permissions";
import type { ChemicalApplication } from "@/types/chemical-tracking";
import { toast } from "sonner";
import { useConfirm } from "@/components/shared/useConfirm";

interface Props {
  jobId: string;
  visitId: string;
  /** Accepted for caller compatibility; area is resolved from the job (see useChemicalJobAreaValue). */
  propertyId?: string | null;
}

/** ISO instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in the viewer's zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
  if (options.length === 0) return <p className="text-xs text-slate-400 dark:text-neutral-500">None configured</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.id}
          className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs cursor-pointer"
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
  fallbackStartTime,
  fallbackEndTime,
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
  /** Crew clock-in/out, offered as the start/end time until one is entered. */
  fallbackStartTime: string | null;
  fallbackEndTime: string | null;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const { can } = usePermissions();
  const canEdit = can("chem_add_edit_usage");
  const save = useSaveChemicalApplication();
  const del = useDeleteChemicalApplication();
  const [chemicalAmount, setChemicalAmount] = useState(application.chemicalAmount?.toString() ?? "");
  const [solutionAmount, setSolutionAmount] = useState(application.solutionAmount?.toString() ?? "");
  const [unitOfMeasureId, setUnitOfMeasureId] = useState(application.unitOfMeasureId ?? "");
  const [solutionUnitOfMeasureId, setSolutionUnitOfMeasureId] = useState(
    application.solutionUnitOfMeasureId ?? ""
  );
  const [applicationMethodId, setApplicationMethodId] = useState(application.applicationMethodId ?? "");
  const [targetIds, setTargetIds] = useState<string[]>(application.targetIds);
  const [areasTreatedIds, setAreasTreatedIds] = useState<string[]>(application.areasTreatedIds);
  const [used, setUsed] = useState(application.used);
  const [applicatorEmployeeId, setApplicatorEmployeeId] = useState(application.applicatorEmployeeId ?? "");
  const [notes, setNotes] = useState(application.notes ?? "");
  // null = untouched: show (and save) the crew clock time, which may load after this row mounts.
  const [startEdit, setStartTime] = useState<string | null>(
    application.applicationStartTime ? toLocalInput(application.applicationStartTime) : null
  );
  const [endEdit, setEndTime] = useState<string | null>(
    application.applicationEndTime ? toLocalInput(application.applicationEndTime) : null
  );
  const startTime = startEdit ?? toLocalInput(fallbackStartTime);
  const endTime = endEdit ?? toLocalInput(fallbackEndTime);

  function toggleTarget(id: string) {
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }
  function toggleArea(id: string) {
    setAreasTreatedIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function handleSave() {
    // applicatorLicenseNumber is a compliance snapshot, not a live join — it
    // must only be (re)captured when the applicator assignment itself is
    // actually changing. Re-sending the CURRENT employee's license on every
    // save (including edits made long after the original application, e.g.
    // just fixing notes) silently overwrote the historical record if that
    // employee's license was renewed/changed/revoked in the meantime.
    const applicatorChanged = (applicatorEmployeeId || null) !== (application.applicatorEmployeeId ?? null);
    const employee = applicatorChanged ? employees.find((e) => e.id === applicatorEmployeeId) : null;
    save.mutate(
      {
        id: application.id,
        jobId,
        visitId,
        productId: application.productId,
        chemicalAmount: chemicalAmount ? parseFloat(chemicalAmount) : null,
        solutionAmount: solutionAmount ? parseFloat(solutionAmount) : null,
        unitOfMeasureId: unitOfMeasureId || null,
        solutionUnitOfMeasureId: solutionUnitOfMeasureId || null,
        applicationMethodId: applicationMethodId || null,
        targetIds,
        areasTreatedIds,
        used,
        applicatorEmployeeId: applicatorEmployeeId || null,
        applicationStartTime: fromLocalInput(startTime),
        applicationEndTime: fromLocalInput(endTime),
        ...(applicatorChanged && { applicatorLicenseNumber: employee?.applicatorLicense ?? null }),
        notes: notes || null,
        // Saving the row is the office confirming what was actually used.
        confirm: true,
      },
      { onError: () => toast.error("Failed to save chemical application") }
    );
  }

  return (
    <div className="rounded-md border p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 dark:text-neutral-100">{productName}</span>
          {application.preloaded && !application.confirmedAt && (
            <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
              Planned — unconfirmed
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={used} onCheckedChange={(v) => setUsed(v === true)} />
            <span className={used ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>{used ? "Used" : "Not used"}</span>
          </label>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400"
            onClick={async () => {
              if (!(await confirm({ title: `Remove ${productName} from this visit?`, confirmLabel: "Remove", destructive: true }))) return;
              del.mutate({ id: application.id, visitId }, {
                onError: () => toast.error("Failed to remove chemical application"),
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Chemical Amt (active)</label>
          <Input
            className="h-8 text-xs"
            type="number"
            step="any"
            value={chemicalAmount}
            onChange={(e) => setChemicalAmount(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Unit</label>
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
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Solution Amt (finished mix)</label>
          <Input
            className="h-8 text-xs"
            type="number"
            step="any"
            value={solutionAmount}
            onChange={(e) => setSolutionAmount(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Solution Unit</label>
          <Select
            value={solutionUnitOfMeasureId || "none"}
            onValueChange={(v) => setSolutionUnitOfMeasureId(v === "none" ? "" : v)}
          >
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
        <label className="text-xs text-muted-foreground">Application Method</label>
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
        <label className="text-xs text-muted-foreground">Target</label>
        <MultiCheck options={targets} selected={targetIds} onToggle={toggleTarget} />
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Areas Treated</label>
        <MultiCheck options={areasTreated} selected={areasTreatedIds} onToggle={toggleArea} />
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Applicator</label>
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

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Application Start</label>
          <Input
            className="h-8 text-xs"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Application End</label>
          <Input
            className="h-8 text-xs"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Notes</label>
        <Textarea rows={2} className="text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

/** Per-visit chemical application logging — the compliance-critical record. */
export function ChemicalApplicationPanel({ jobId, visitId }: Props) {
  const { can, isAdmin } = usePermissions();
  const canEdit = can("chem_add_edit_usage");
  const canSendNotice = can("chem_send_application_notice");
  const { data: applications = [], isFetched: applicationsFetched } = useChemicalApplicationsForVisit(visitId);
  const { data: allProducts = [] } = useProducts();
  const { data: methods = [] } = useChemicalLookupItems("application_method");
  const { data: units = [] } = useChemicalLookupItems("volume_unit");
  // Area units ride along in unitsById so the rate math can scale
  // "per 1,000 sq ft" / "per acre" bases to the property's square feet.
  const { data: areaUnits = [] } = useChemicalLookupItems("area_unit");
  const { data: targets = [] } = useChemicalLookupItems("target");
  const { data: areasTreated = [] } = useChemicalLookupItems("areas_treated");
  const { data: employeesRaw = [] } = useSelectableEmployees();
  const { data: settings } = useChemicalSettings();
  const saveApplication = useSaveChemicalApplication();
  const loadServiceChemicals = useLoadServiceChemicals();
  const { data: clockTimes } = useVisitClockTimes(visitId);
  const { data: confirmationWaived = false } = useChemicalConfirmationWaived(visitId);
  const waiveConfirmation = useWaiveChemicalConfirmation();
  const unconfirmed = applications.filter((a) => a.preloaded && !a.confirmedAt);
  const [confirmingAll, setConfirmingAll] = useState(false);

  async function confirmAllAsPlanned() {
    setConfirmingAll(true);
    try {
      for (const a of unconfirmed) {
        await saveApplication.mutateAsync({ id: a.id, jobId, visitId, confirm: true });
      }
      toast.success(`Confirmed ${unconfirmed.length} chemical${unconfirmed.length === 1 ? "" : "s"} as planned`);
    } catch {
      toast.error("Failed to confirm chemicals");
    } finally {
      setConfirmingAll(false);
    }
  }

  const [addingProductId, setAddingProductId] = useState("");
  const { data: addingProductRates = [] } = useChemicalApplicationRates(addingProductId || undefined);
  const { data: areaValue = null } = useChemicalJobAreaValue(jobId, settings?.areaCustomFieldId);
  const unitsById = new Map([...units, ...areaUnits].map((u) => [u.id, u]));

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

  // A visit with nothing logged yet gets its service's chemicals pre-loaded
  // (once per visit per mount) so the office confirms rather than re-keys, and
  // the crew's Chemical Mix card has something to show.
  const preloadedVisits = useRef(new Set<string>());
  const loadService = loadServiceChemicals.mutate;
  useEffect(() => {
    if (!canEdit || !applicationsFetched || applications.length > 0) return;
    if (preloadedVisits.current.has(visitId)) return;
    preloadedVisits.current.add(visitId);
    loadService(
      { visitId },
      { onSuccess: (count) => count > 0 && toast.success(`Loaded ${count} service chemical${count === 1 ? "" : "s"} for this visit`) }
    );
  }, [canEdit, applicationsFetched, applications.length, visitId, loadService]);

  const showWeather = settings?.conditionsDisplay === "weather" || settings?.conditionsDisplay === "both";
  const showPh = settings?.conditionsDisplay === "ph" || settings?.conditionsDisplay === "both";

  function handleAdd() {
    if (!addingProductId) return;

    // Freeze the product's EPA #, re-entry interval, and restricted-product
    // flag at the moment this application is recorded — all three are
    // compliance-sensitive and can be corrected/changed later in the
    // catalog, which must never rewrite the historical record of what was
    // actually true when this specific application happened.
    const selectedProduct = chemicalProducts.find((p) => p.id === addingProductId);

    let chemicalAmount: number | null | undefined;
    let unitOfMeasureId: string | null | undefined;
    let applicationMethodId: string | null | undefined;
    let solutionAmount: number | null | undefined;
    let solutionUnitOfMeasureId: string | null | undefined;

    if (settings?.autoCalcQuantity && settings.areaCustomFieldId) {
      const defaultRate = addingProductRates.find((r) => r.isDefault) ?? addingProductRates[0];
      if (defaultRate && areaValue != null) {
        const computed = calcChemicalAndSolution(defaultRate, areaValue, unitsById);
        if (computed != null) {
          chemicalAmount = Math.round(computed.chemicalAmount * 10000) / 10000;
          unitOfMeasureId = computed.chemicalUnitOfMeasureId;
          applicationMethodId = defaultRate.applicationMethodId;
          if (computed.solutionAmount != null) {
            solutionAmount = Math.round(computed.solutionAmount * 100) / 100;
            solutionUnitOfMeasureId = computed.solutionUnitOfMeasureId;
          }
        }
      }
    }

    saveApplication.mutate(
      {
        jobId,
        visitId,
        productId: addingProductId,
        used: true,
        epaNumberSnapshot: selectedProduct?.epaRegistrationNumber ?? null,
        reEntryIntervalSnapshot: selectedProduct?.reEntryInterval ?? null,
        restrictedProductSnapshot: selectedProduct?.restrictedProduct ?? false,
        ...(chemicalAmount !== undefined && { chemicalAmount }),
        ...(unitOfMeasureId !== undefined && { unitOfMeasureId }),
        ...(applicationMethodId !== undefined && { applicationMethodId }),
        ...(solutionAmount !== undefined && { solutionAmount }),
        ...(solutionUnitOfMeasureId !== undefined && { solutionUnitOfMeasureId }),
      },
      { onError: () => toast.error("Failed to add chemical") }
    );
    setAddingProductId("");
  }

  function applyConditionsToAll() {
    applications.forEach((a) => {
      saveApplication.mutate(
        {
          id: a.id,
          jobId,
          visitId,
          temperature: temperature ? parseFloat(temperature) : null,
          windSpeed: windSpeed ? parseFloat(windSpeed) : null,
          windDirection: windDirection || null,
          phLevel: phLevel ? parseFloat(phLevel) : null,
        },
        { onError: () => toast.error(`Failed to update conditions for ${a.productName ?? "a chemical"}`) }
      );
    });
  }

  const linkable = chemicalProducts.filter((p) => !applications.some((a) => a.productId === p.id));

  return (
    <div className="flex flex-col gap-3">
      {applications.length > 0 && canSendNotice && (
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
        <div className="rounded-md border bg-slate-50 dark:bg-muted/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conditions</p>
          <div className="grid grid-cols-4 gap-2">
            {showWeather && (
              <>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">Temp (°F)</label>
                  <Input className="h-8 text-xs" type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">Wind Speed</label>
                  <Input className="h-8 text-xs" type="number" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">Wind Direction</label>
                  <Input className="h-8 text-xs" value={windDirection} onChange={(e) => setWindDirection(e.target.value)} placeholder="e.g. NW" />
                </div>
              </>
            )}
            {showPh && (
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">pH Level</label>
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
        <p className="text-xs text-slate-400 dark:text-neutral-500">No chemical applications logged for this visit yet.</p>
      )}

      {unconfirmed.length > 0 && canEdit && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-medium">
            {unconfirmed.length} chemical{unconfirmed.length === 1 ? " is" : "s are"} still the planned amount.
          </p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-300">
            Until the amount used is confirmed (by the crew, or by saving it here), {unconfirmed.length === 1 ? "it isn't" : "they aren't"} counted
            in the compliance report or taken out of stock
            {confirmationWaived ? "." : ", and the visit can't be completed when the crew confirmation setting is on."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={confirmAllAsPlanned} disabled={confirmingAll}>
              {confirmingAll ? "Confirming…" : "Confirm all as planned"}
            </Button>
            {isAdmin && !confirmationWaived && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={waiveConfirmation.isPending}
                onClick={() =>
                  waiveConfirmation.mutate(visitId, {
                    onSuccess: () => toast.success("This visit can now be completed without chemical confirmation"),
                    onError: () => toast.error("Couldn't waive chemical confirmation"),
                  })
                }
              >
                Allow completing without confirmation
              </Button>
            )}
            {confirmationWaived && <span className="self-center text-amber-800 dark:text-amber-300">Admin allowed completing without confirmation.</span>}
          </div>
        </div>
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
          fallbackStartTime={clockTimes?.clockedInAt ?? null}
          fallbackEndTime={clockTimes?.clockedOutAt ?? null}
        />
      ))}

      {canEdit && (
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
      )}
    </div>
  );
}
