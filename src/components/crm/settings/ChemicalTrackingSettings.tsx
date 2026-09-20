"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useChemicalSettings,
  useUpdateChemicalSettings,
  useChemicalLookupItems,
  useCreateChemicalLookupItem,
  useUpdateChemicalLookupItem,
} from "@/lib/hooks/use-chemical-tracking";
import { useCustomFieldDefs } from "@/lib/hooks/use-rate-matrix";
import type { ChemicalConditionsDisplay, ChemicalLookupType, ChemicalUnitClass } from "@/types/chemical-tracking";

function Section({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-50"
      >
        <div>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

function GeneralChemicalSettings() {
  const { data: settings } = useChemicalSettings();
  const update = useUpdateChemicalSettings();
  const { data: propertyFieldDefs = [] } = useCustomFieldDefs("property");
  const numericFieldDefs = propertyFieldDefs.filter((d) => d.fieldType === "number");

  function handleConditionsChange(v: ChemicalConditionsDisplay) {
    update.mutate(
      { conditionsDisplay: v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
      }
    );
  }

  function handleAutoCalcChange(v: boolean) {
    update.mutate(
      { autoCalcQuantity: v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
      }
    );
  }

  function handleAreaFieldChange(v: string) {
    update.mutate(
      { areaCustomFieldId: v === "none" ? null : v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 max-w-xs">
        <Label className="text-xs">Conditions Shown on Applications</Label>
        <Select
          value={settings?.conditionsDisplay ?? "weather"}
          onValueChange={(v) => handleConditionsChange(v as ChemicalConditionsDisplay)}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weather">Weather Conditions (temp, wind)</SelectItem>
            <SelectItem value="ph">pH Level</SelectItem>
            <SelectItem value="both">Both</SelectItem>
            <SelectItem value="neither">Neither</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex max-w-xs items-center justify-between gap-3 rounded-md border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-slate-800">Default Chemical Quantity</p>
          <p className="text-xs text-slate-500">
            Auto-calculate quantity to apply from a property&apos;s custom field and the product&apos;s
            application rate.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={settings?.autoCalcQuantity ?? false}
          onClick={() => handleAutoCalcChange(!(settings?.autoCalcQuantity ?? false))}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            settings?.autoCalcQuantity ? "bg-brand-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings?.autoCalcQuantity ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {settings?.autoCalcQuantity && (
        <div className="flex flex-col gap-1.5 max-w-xs">
          <Label className="text-xs">Area Custom Field</Label>
          <Select value={settings?.areaCustomFieldId ?? "none"} onValueChange={handleAreaFieldChange}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select a property field…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {numericFieldDefs.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            The numeric property field (e.g. Turf Sq Ft) used to auto-calculate quantity from each
            product&apos;s application rate.
          </p>
        </div>
      )}
    </div>
  );
}

// Sensible starting points for lists that have well-known standard units —
// seeded once when an org first opens Chemical Tracking settings with an
// empty list. Other lookup types (e.g. Areas Treated) are site-specific and
// have no universal defaults, so they're left for the user to define.
// Matches Service Autopilot's Units of Measure list (liquid + weight + metric).
// unitClass/baseFactor let the mix calc (calcChemicalAndSolution) convert
// between these units — a factor to a canonical base unit (fluid ounce for
// volume, gram for mass). Keep in sync with the backfill in migration
// 20260918030000_chemical_mix_volume_calc.sql, which tags these same names
// for orgs that seeded their list before this factor data existed.
const DEFAULT_VOLUME_UNITS: { name: string; unitClass: ChemicalUnitClass; baseFactor: number }[] = [
  { name: "Cups", unitClass: "volume", baseFactor: 8 },
  { name: "Gallons", unitClass: "volume", baseFactor: 128 },
  { name: "Grams", unitClass: "mass", baseFactor: 1 },
  { name: "Kilograms", unitClass: "mass", baseFactor: 1000 },
  { name: "Liters", unitClass: "volume", baseFactor: 33.814 },
  { name: "Milliliters", unitClass: "volume", baseFactor: 0.033814 },
  { name: "Ounces - Liquid", unitClass: "volume", baseFactor: 1 },
  { name: "Ounces - Weight", unitClass: "mass", baseFactor: 28.3495 },
  { name: "Pints", unitClass: "volume", baseFactor: 16 },
  { name: "Pounds", unitClass: "mass", baseFactor: 453.592 },
  { name: "Quarts", unitClass: "volume", baseFactor: 32 },
  { name: "Tablespoons", unitClass: "volume", baseFactor: 0.5 },
  { name: "Teaspoons", unitClass: "volume", baseFactor: 1 / 6 },
];

/**
 * Alternate spellings a user is likely to type for one of the standard units
 * above, so a hand-added unit still carries the unitClass/baseFactor the mix
 * calc needs. Without that metadata calcChemicalAndSolution can't convert the
 * unit and silently drops the mix volume for every rate that uses it, which is
 * indistinguishable from "this rate has no mix".
 *
 * Deliberately absent: a bare "Ounce"/"oz". It is genuinely ambiguous between
 * fluid and weight ounces (a ~28x difference on a pesticide mix), which is why
 * migration 20260918030000 left the existing "Ounce" row untagged rather than
 * guessing. Anything not recognised here is created untagged and the user is
 * told so.
 */
const VOLUME_UNIT_ALIASES: Record<string, string> = {
  gallon: "Gallons",
  gal: "Gallons",
  gals: "Gallons",
  "fluid ounce": "Ounces - Liquid",
  "fluid ounces": "Ounces - Liquid",
  "fl oz": "Ounces - Liquid",
  "liquid ounce": "Ounces - Liquid",
  "liquid ounces": "Ounces - Liquid",
  quart: "Quarts",
  qt: "Quarts",
  pint: "Pints",
  pt: "Pints",
  cup: "Cups",
  liter: "Liters",
  litre: "Liters",
  litres: "Liters",
  milliliter: "Milliliters",
  millilitre: "Milliliters",
  millilitres: "Milliliters",
  ml: "Milliliters",
  tablespoon: "Tablespoons",
  tbsp: "Tablespoons",
  teaspoon: "Teaspoons",
  tsp: "Teaspoons",
  gram: "Grams",
  g: "Grams",
  kilogram: "Kilograms",
  kg: "Kilograms",
  pound: "Pounds",
  lb: "Pounds",
  lbs: "Pounds",
  "weight ounce": "Ounces - Weight",
  "weight ounces": "Ounces - Weight",
};

/** Conversion metadata for a unit name the user typed, or undefined when the
 *  name isn't one we can safely pin to a known scale. */
function knownVolumeUnit(name: string): { unitClass: ChemicalUnitClass; baseFactor: number } | undefined {
  const normalized = name.trim().toLowerCase();
  const canonical =
    DEFAULT_VOLUME_UNITS.find((u) => u.name.toLowerCase() === normalized)?.name ??
    VOLUME_UNIT_ALIASES[normalized];
  if (!canonical) return undefined;
  const match = DEFAULT_VOLUME_UNITS.find((u) => u.name === canonical);
  return match ? { unitClass: match.unitClass, baseFactor: match.baseFactor } : undefined;
}

const DEFAULT_LOOKUP_ITEMS: Partial<Record<ChemicalLookupType, string[]>> = {
  volume_unit: DEFAULT_VOLUME_UNITS.map((u) => u.name),
  // Square Foot and 1,000 Sq Ft kept adjacent (a lawn-chemical rate is almost
  // always expressed as one or the other) with Acre last, rather than
  // alphabetical order which splits them apart.
  area_unit: ["Square Foot", "1,000 Sq Ft", "Acre"],
};

/** Which chem_create_* permission key gates adding a new item to each lookup
 *  list. `areas_treated` has no dedicated catalog key, so it's always allowed. */
const LOOKUP_CREATE_PERMISSION: Partial<Record<ChemicalLookupType, string>> = {
  application_method: "chem_create_application_method",
  target: "chem_create_target",
  volume_unit: "chem_create_uom",
  area_unit: "chem_create_uom",
};

function LookupListEditor({ listType, addPlaceholder }: { listType: ChemicalLookupType; addPlaceholder: string }) {
  const { can } = usePermissions();
  const requiredKey = LOOKUP_CREATE_PERMISSION[listType];
  const canCreate = !requiredKey || can(requiredKey);
  const { data: items = [], isLoading } = useChemicalLookupItems(listType);
  const create = useCreateChemicalLookupItem();
  const update = useUpdateChemicalLookupItem();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const seedInFlightRef = useRef(false);
  const seedAttemptsRef = useRef(0);
  const resumeSeedRef = useRef(false);

  useEffect(() => {
    const defaults = DEFAULT_LOOKUP_ITEMS[listType];
    if (!defaults || isLoading || seedInFlightRef.current) return;
    // Seeding writes 13 volume + 3 area rows into the org's catalog, so it is
    // a create and has to respect the same permission as the Add button —
    // chem_create_uom is app-layer only (RLS lets any member insert), so
    // without this check a crew or viewer just opening the tab populated the
    // list for the whole org.
    if (!canCreate) return;

    const missing = defaults.filter(
      (name) => !items.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase())
    );
    if (missing.length === 0) return;
    // Only ever seed a list nobody has touched — except when an earlier
    // attempt in this session died part-way, in which case we finish the job
    // rather than leaving a half-populated list that can never be topped up.
    if (items.length > 0 && !resumeSeedRef.current) return;
    if (seedAttemptsRef.current >= 2) return;

    seedInFlightRef.current = true;
    seedAttemptsRef.current += 1;
    (async () => {
      try {
        for (const name of missing) {
          const volumeUnitMeta =
            listType === "volume_unit" ? DEFAULT_VOLUME_UNITS.find((u) => u.name === name) : undefined;
          const created = await create.mutateAsync({
            listType,
            name,
            ...(volumeUnitMeta && { unitClass: volumeUnitMeta.unitClass, baseFactor: volumeUnitMeta.baseFactor }),
          });
          await update.mutateAsync({ id: created.id, sortOrder: defaults.indexOf(name) });
        }
        resumeSeedRef.current = false;
      } catch {
        // The rows already written stay; flag the list so the next pass fills
        // in the remainder instead of treating a partial list as finished.
        resumeSeedRef.current = true;
        toast.error("Couldn't finish adding the standard units — reopen this section to complete the list.");
      } finally {
        seedInFlightRef.current = false;
      }
    })();
  }, [listType, isLoading, items, canCreate, create, update]);

  function commitAdd() {
    const name = newName.trim();
    if (!name) return;
    // A volume/area unit created with no unitClass/baseFactor is invisible to
    // the mix calc — every rate using it silently loses its mix volume. Pin
    // the standard names to their known scale so a hand-added "Gallons"
    // behaves exactly like the seeded one.
    const meta = listType === "volume_unit" ? knownVolumeUnit(name) : undefined;
    create.mutate(
      { listType, name, ...(meta && { unitClass: meta.unitClass, baseFactor: meta.baseFactor }) },
      {
        onSuccess: () => {
          setNewName("");
          setAdding(false);
          if (listType === "volume_unit" && !meta) {
            toast.warning(
              `"${name}" was added, but it has no known conversion, so mix volumes can't be calculated for rates that use it. Use one of the standard units (e.g. Gallons, Ounces - Liquid) if you need the mix calculation.`
            );
          }
        },
        onError: (err) => toast.error(`Failed to add: ${(err as Error).message}`),
      }
    );
  }

  return (
    <div className="divide-y">
      {items.length === 0 && !adding && (
        <p className="py-3 text-xs text-slate-400">No items yet.</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-2.5">
          <span className="flex-1 text-sm text-slate-800">{item.name}</span>
          <button
            role="switch"
            aria-checked={item.isActive}
            onClick={() => update.mutate({ id: item.id, isActive: !item.isActive })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              item.isActive ? "bg-brand-500" : "bg-slate-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                item.isActive ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-3 py-2.5">
          <input
            autoFocus
            placeholder={addPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            className="flex-1 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button onClick={commitAdd} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">
            Add
          </button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="rounded p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : canCreate ? (
        <div className="py-3">
          <button onClick={() => setAdding(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            + Add item
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── Client Notice Email templates ────────────────────────────────────────────

function NoticeEmailTemplatesEditor() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-slate-200 p-4">
      <p className="text-sm text-slate-600">
        Build and edit client notice email templates in <span className="font-medium">Documents</span> — create a
        document with type &quot;Chemical&quot;, and it&apos;ll show up in the template picker when sending an
        application notice.
      </p>
      <Link href="/crm/settings/documents" className="w-fit">
        <Button size="sm" variant="outline" className="h-8 text-xs">
          Go to Documents
        </Button>
      </Link>
    </div>
  );
}

export function ChemicalTrackingTab() {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <Section title="General Chemical Settings" defaultOpen>
        <GeneralChemicalSettings />
      </Section>
      <Section title="Application Methods" description="How chemicals are applied — e.g. Broadcast, Backpack Sprayer, Truck Tank">
        <LookupListEditor listType="application_method" addPlaceholder="e.g. Backpack Sprayer" />
      </Section>
      <Section title="Targets" description="What the chemical treats — pests, weeds, etc.">
        <LookupListEditor listType="target" addPlaceholder="e.g. Grubs" />
      </Section>
      <Section title="Volume Units" description="Units for measuring chemical volume — ounces, gallons, pounds">
        <LookupListEditor listType="volume_unit" addPlaceholder="e.g. Fluid Ounces" />
      </Section>
      <Section title="Area Units" description="Units for measuring the size of the treated area">
        <LookupListEditor listType="area_unit" addPlaceholder="e.g. 1,000 sq ft" />
      </Section>
      <Section title="Areas Treated" description="Named property zones that can be treated — front lawn, back lawn, etc.">
        <LookupListEditor listType="areas_treated" addPlaceholder="e.g. Front Turf" />
      </Section>
      <Section title="Client Notice Email" description="Sent to clients after a chemical application is logged">
        <NoticeEmailTemplatesEditor />
      </Section>
    </div>
  );
}
