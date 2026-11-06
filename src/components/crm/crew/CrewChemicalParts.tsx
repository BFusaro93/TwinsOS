"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  openCrewReference,
  useAddCrewChemical,
  useCrewChemicalCatalog,
  useCrewConditions,
  type ChemicalConditionsInput,
  type ConditionsReading,
  type CrewChemicalCatalog,
  type VisitChemicalApplication,
} from "@/lib/hooks/use-crew-app";
import { t } from "@/lib/crew-i18n";

/** The product label's directions, one tap away, plus the label / SDS documents the office filed
 *  for this product in the Reference Library. Renders nothing when there is nothing to show. */
export function ChemicalLabel({
  chemical, documents = [],
}: {
  chemical: Pick<VisitChemicalApplication, "epaNumber" | "reEntryInterval" | "labelInstructions" | "restricted">;
  documents?: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { epaNumber, reEntryInterval, labelInstructions, restricted } = chemical;
  if (!epaNumber && !reEntryInterval && !labelInstructions && !restricted && documents.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 min-h-8"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? t("Hide label") : t("View label")}
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-md bg-card border border-border px-3 py-2 text-xs text-slate-700 dark:text-neutral-300">
          {restricted && <p className="font-semibold text-red-700 dark:text-red-400">{t("Restricted-use product")}</p>}
          {epaNumber && <p><span className="text-muted-foreground">{t("EPA #")}</span> {epaNumber}</p>}
          {reEntryInterval && <p><span className="text-muted-foreground">{t("Re-entry interval")}</span> {reEntryInterval}</p>}
          {labelInstructions && <p className="whitespace-pre-wrap">{labelInstructions}</p>}
          {documents.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant="outline"
              className="h-10 w-full justify-start gap-2 text-xs"
              onClick={() => openCrewReference(d.id).catch(() => toast.error(t("Couldn't open the document — check your connection.")))}
            >
              Open {d.title}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ConditionsDraft {
  temperature: string;
  windSpeed: string;
  windDirection: string;
  phLevel: string;
}

export const EMPTY_CONDITIONS: ConditionsDraft = { temperature: "", windSpeed: "", windDirection: "", phLevel: "" };

/** A weather reading as the conditions draft (pH is never from the weather). */
export function conditionsFromReading(r: ConditionsReading, keep: ConditionsDraft): ConditionsDraft {
  return {
    ...keep,
    temperature: r.temperatureF != null ? String(r.temperatureF) : keep.temperature,
    windSpeed: r.windMph != null ? String(r.windMph) : keep.windSpeed,
    windDirection: r.windDirection ?? keep.windDirection,
  };
}

/** Draft -> what the server takes, leaving out anything left blank or not a number. */
export function conditionsPayload(d: ConditionsDraft): ChemicalConditionsInput {
  const num = (v: string) => {
    const n = parseFloat(v);
    return v.trim() !== "" && Number.isFinite(n) ? n : undefined;
  };
  return {
    temperature: num(d.temperature),
    windSpeed: num(d.windSpeed),
    windDirection: d.windDirection.trim() || undefined,
    phLevel: num(d.phLevel),
  };
}

/** Weather and/or pH inputs, per the company's Conditions setting. Optional for the crew. */
export function ChemicalConditionsFields({
  display, value, onChange, reading, onUseReading,
}: {
  display: "weather" | "ph" | "both" | "neither";
  value: ConditionsDraft;
  onChange: (next: ConditionsDraft) => void;
  /** Weather near the stop, offered as a one-tap fill (and applied automatically on first load). */
  reading?: ConditionsReading | null;
  onUseReading?: () => void;
}) {
  const showWeather = display === "weather" || display === "both";
  const showPh = display === "ph" || display === "both";
  if (!showWeather && !showPh) return null;
  const field = (key: keyof ConditionsDraft, label: string, inputMode: "decimal" | "text", placeholder: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type={inputMode === "decimal" ? "number" : "text"}
        inputMode={inputMode}
        step="any"
        value={value[key]}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        className="h-11 text-base"
      />
    </label>
  );
  return (
    <div className="rounded-lg bg-card border border-border px-3 py-2">
      <p className="text-sm font-medium text-slate-800 dark:text-neutral-100">Conditions <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
      {showWeather && reading && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          National Weather Service{reading.source === "forecast" ? " forecast" : ""}, {new Date(reading.observedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {reading.description ? ` · ${reading.description}` : ""}.{" "}
          {onUseReading && <button type="button" onClick={onUseReading} className="font-medium text-emerald-700 dark:text-emerald-400 underline">{t("Update")}</button>}
        </p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {showWeather && field("temperature", "Temp °F", "decimal", "72")}
        {showWeather && field("windSpeed", t("Wind mph"), "decimal", "5")}
        {showWeather && field("windDirection", t("Wind from"), "text", "NW")}
        {showPh && field("phLevel", "pH", "decimal", "7.0")}
      </div>
    </div>
  );
}

/** Record a chemical the office didn't preload — an extra spot treatment, a substitute product.
 *  It is saved already confirmed, so how it was applied and the conditions go in with it. Inside
 *  the confirm card the crew has already filled the stop's conditions: pass them as
 *  `sharedConditions` and the form uses those instead of showing its own fields. */
export function AddChemicalForm({
  visitId, disabled, sharedConditions,
}: {
  visitId: string;
  disabled?: boolean;
  sharedConditions?: ConditionsDraft;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState("");
  const [apply, setApply] = useState<ChemApplyEdit | undefined>(undefined);
  const [ownConditions, setOwnConditions] = useState<ConditionsDraft>(EMPTY_CONDITIONS);
  const { data: catalog } = useCrewChemicalCatalog(open ? visitId : undefined);
  const { data: weather } = useCrewConditions(open && !sharedConditions ? visitId : undefined);
  const weatherFilled = useRef(false);
  useEffect(() => {
    if (weather?.reading && !weatherFilled.current) {
      weatherFilled.current = true;
      setOwnConditions((prev) => conditionsFromReading(weather.reading!, prev));
    }
  }, [weather]);
  const add = useAddCrewChemical();

  function pickProduct(id: string) {
    setProductId(id);
    const dflt = catalog?.products.find((p) => p.id === id)?.defaultUnitId;
    if (dflt) setUnitId(dflt);
  }

  async function submit() {
    const n = parseFloat(amount);
    if (!productId) return toast.error(t("Choose the product"));
    if (!unitId) return toast.error(t("Choose a unit"));
    if (!Number.isFinite(n) || n <= 0) return toast.error(t("Enter how much was used"));
    await add.mutateAsync({
      visitId,
      productId,
      chemicalAmount: n,
      unitOfMeasureId: unitId,
      ...(apply?.methodId !== undefined ? { applicationMethodId: apply.methodId } : {}),
      ...(apply?.targetIds !== undefined ? { targetIds: apply.targetIds } : {}),
      ...(apply?.areasTreatedIds !== undefined ? { areasTreatedIds: apply.areasTreatedIds } : {}),
      conditions: conditionsPayload(sharedConditions ?? ownConditions),
    });
    toast.success(t("Chemical added"));
    setProductId("");
    setAmount("");
    setApply(undefined);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full h-11 gap-2" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {t("Add a chemical")}
      </Button>
    );
  }
  return (
    <div className="rounded-lg bg-card border border-border px-3 py-3 space-y-2">
      <p className="text-sm font-medium text-slate-800 dark:text-neutral-100">{t("Add a chemical you applied")}</p>
      {!catalog ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <Select value={productId} onValueChange={pickProduct}>
            <SelectTrigger className="h-11 text-base"><SelectValue placeholder={t("Product")} /></SelectTrigger>
            <SelectContent>
              {catalog.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("Amount used")}
              className="h-11 w-36 text-base"
            />
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="h-11 flex-1 text-base"><SelectValue placeholder={t("Unit")} /></SelectTrigger>
              <SelectContent>
                {catalog.units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ChemicalApplyFields
            chemical={{ applicationMethodId: null, targetIds: [], areasTreatedIds: [] }}
            catalog={catalog}
            edit={apply}
            onChange={setApply}
          />
          {!sharedConditions && (
            <ChemicalConditionsFields
              display={catalog.conditionsDisplay}
              value={ownConditions}
              onChange={setOwnConditions}
              reading={weather?.reading}
              onUseReading={() => weather?.reading && setOwnConditions((prev) => conditionsFromReading(weather.reading!, prev))}
            />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={add.isPending}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save chemical"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** What the crew changed about HOW a chemical was applied; a key left undefined = unchanged. */
export interface ChemApplyEdit {
  methodId?: string | null;
  targetIds?: string[];
  areasTreatedIds?: string[];
}

function ChipGroup({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              aria-pressed={on}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                on
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-card text-slate-700 dark:text-neutral-300"
              }`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Method, target and treated-area pickers for one chemical, starting from what the office
 *  planned. Collapsed by default so the common case (confirm as planned) stays one tap. */
export function ChemicalApplyFields({
  chemical, catalog, edit, onChange,
}: {
  chemical: Pick<VisitChemicalApplication, "applicationMethodId" | "targetIds" | "areasTreatedIds">;
  catalog: CrewChemicalCatalog | undefined;
  edit: ChemApplyEdit | undefined;
  onChange: (next: ChemApplyEdit) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!catalog || (catalog.methods.length === 0 && catalog.targets.length === 0 && catalog.areasTreated.length === 0)) return null;

  const methodId = edit?.methodId !== undefined ? edit.methodId : chemical.applicationMethodId;
  const targetIds = edit?.targetIds ?? chemical.targetIds;
  const areaIds = edit?.areasTreatedIds ?? chemical.areasTreatedIds;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const nameOf = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;
  const summary = [
    nameOf(catalog.methods, methodId ?? null),
    targetIds.map((t) => nameOf(catalog.targets, t)).filter(Boolean).join(", "),
    areaIds.map((a) => nameOf(catalog.areasTreated, a)).filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400 min-h-8"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? t("Hide how applied") : summary ? t("How applied: {s}", { s: summary }) : t("How applied (method, target, area)")}
      </button>
      {open && (
        <div className="mt-1 space-y-2 rounded-md bg-card border border-border px-3 py-2">
          {catalog.methods.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("Method")}</p>
              <Select value={methodId ?? ""} onValueChange={(v) => onChange({ ...edit, methodId: v })}>
                <SelectTrigger className="h-11 text-base"><SelectValue placeholder={t("Method")} /></SelectTrigger>
                <SelectContent>
                  {catalog.methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <ChipGroup label={t("Target")} options={catalog.targets} selected={targetIds} onToggle={(id) => onChange({ ...edit, targetIds: toggle(targetIds, id) })} />
          <ChipGroup label={t("Area treated")} options={catalog.areasTreated} selected={areaIds} onToggle={(id) => onChange({ ...edit, areasTreatedIds: toggle(areaIds, id) })} />
        </div>
      )}
    </div>
  );
}
