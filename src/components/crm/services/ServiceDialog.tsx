"use client";

import { useState, useEffect } from "react";
import { ServiceJobCostingTab } from "./ServiceJobCostingTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import {
  useCreateCRMService,
  useUpdateCRMService,
  useCRMServices,
} from "@/lib/hooks/use-crm-jobs";
import {
  useRateMatrix,
  useUpsertRateMatrixRow,
  useDeleteRateMatrixRow,
  useCustomFieldDefs,
} from "@/lib/hooks/use-rate-matrix";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { useProducts } from "@/lib/hooks/use-products";
import { useServiceChemicals, useSaveServiceChemicals } from "@/lib/hooks/use-chemical-tracking";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import type { CRMService, BudgetMethod } from "@/types/crm-jobs";
import { toast } from "sonner";

const UNITS = ["visit", "sqft", "lf", "cuyd", "acres", "hr", "each", "lb", "gal"];
// Fallback shown only until the org has configured its own list under
// Settings > Services > Service Categories.
const FALLBACK_CATEGORIES = ["lawn", "landscape", "snow", "irrigation", "tree", "chemical", "other"];

type Tab = "details" | "descriptions" | "rate_matrix" | "sub_services" | "chemicals" | "job_costing" | "audit";

interface Props {
  open: boolean;
  service: CRMService | null;
  onClose: () => void;
}

interface FormState {
  name: string;
  code: string;
  category: string;
  unit: string;
  serviceMode: string;
  parentServiceId: string;
  defaultRateCents: string;
  defaultBHrs: string;
  defaultBCostCents: string;
  budgetMethod: BudgetMethod;
  productionRateSqftPerHr: string;
  targetRateCents: string;
  targetRateWithDriveCents: string;
  taskColor: string;
  isActive: boolean;
  showInSnowDispatch: boolean;
  onlyForEstimates: boolean;
  trackChemicals: boolean;
  invoiceDescription: string;
  descriptionOnEstimate: string;
  rateMatrixField: string;
  rateMatrixCalc: string;
  matrixTailEveryQty: string;
  matrixTailOverQty: string;
  matrixTailRateCents: string;
  matrixTailHours: string;
  matrixTailCostCents: string;
}

function emptyForm(): FormState {
  return {
    name: "", code: "", category: "lawn", unit: "visit",
    serviceMode: "flat_rate", parentServiceId: "",
    defaultRateCents: "", defaultBHrs: "", defaultBCostCents: "",
    budgetMethod: "manual",
    productionRateSqftPerHr: "",
    targetRateCents: "", targetRateWithDriveCents: "",
    taskColor: "#3B82F6",
    isActive: true, showInSnowDispatch: false,
    onlyForEstimates: false, trackChemicals: false,
    invoiceDescription: "", descriptionOnEstimate: "",
    rateMatrixField: "", rateMatrixCalc: "qty_x_rate_x_visits",
    matrixTailEveryQty: "", matrixTailOverQty: "",
    matrixTailRateCents: "", matrixTailHours: "", matrixTailCostCents: "",
  };
}

function serviceToForm(s: CRMService): FormState {
  return {
    name: s.name,
    code: s.code ?? "",
    category: s.category,
    unit: s.unit,
    serviceMode: s.serviceMode,
    parentServiceId: s.parentServiceId ?? "",
    defaultRateCents: s.defaultRateCents != null ? (s.defaultRateCents / 100).toFixed(2) : "",
    defaultBHrs: s.defaultBHrs > 0 ? String(s.defaultBHrs) : "",
    defaultBCostCents: s.defaultBCostCents > 0 ? (s.defaultBCostCents / 100).toFixed(2) : "",
    budgetMethod: s.budgetMethod,
    productionRateSqftPerHr: s.productionRateSqftPerHr != null ? String(s.productionRateSqftPerHr) : "",
    targetRateCents: s.targetRateCents > 0 ? (s.targetRateCents / 100).toFixed(2) : "",
    targetRateWithDriveCents: s.targetRateWithDriveCents > 0 ? (s.targetRateWithDriveCents / 100).toFixed(2) : "",
    taskColor: s.taskColor,
    isActive: s.isActive,
    showInSnowDispatch: s.showInSnowDispatch,
    onlyForEstimates: s.onlyForEstimates,
    trackChemicals: s.trackChemicals,
    invoiceDescription: s.invoiceDescription ?? "",
    descriptionOnEstimate: s.descriptionOnEstimate ?? "",
    rateMatrixField: s.rateMatrixField ?? "",
    rateMatrixCalc: s.rateMatrixCalc,
    matrixTailEveryQty: s.matrixTailEveryQty != null ? String(s.matrixTailEveryQty) : "",
    matrixTailOverQty: s.matrixTailOverQty != null ? String(s.matrixTailOverQty) : "",
    matrixTailRateCents: s.matrixTailRateCents != null ? (s.matrixTailRateCents / 100).toFixed(2) : "",
    matrixTailHours: s.matrixTailHours != null ? String(s.matrixTailHours) : "",
    matrixTailCostCents: s.matrixTailCostCents != null ? (s.matrixTailCostCents / 100).toFixed(2) : "",
  };
}

function parseCents(v: string): number {
  return Math.round((parseFloat(v) || 0) * 100);
}

function parseNum(v: string): number {
  return parseFloat(v) || 0;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

// ── Rate Matrix Tab ───────────────────────────────────────────────────────────

interface RateMatrixTabProps {
  serviceId: string;
}

function RateMatrixTab({ serviceId }: RateMatrixTabProps) {
  const { data: rows = [] } = useRateMatrix(serviceId);
  const upsert = useUpsertRateMatrixRow();
  const deleteRow = useDeleteRateMatrixRow();

  const { data: fieldDefs = [] } = useCustomFieldDefs("property");
  const numericFieldDefs = fieldDefs.filter((d) => d.fieldType === "number");

  const currentFieldId = rows[0]?.customFieldId ?? "";
  const [selectedFieldId, setSelectedFieldId] = useState<string>(currentFieldId);

  useEffect(() => {
    if (currentFieldId && !selectedFieldId) {
      setSelectedFieldId(currentFieldId);
    }
  }, [currentFieldId, selectedFieldId]);

  function addRow() {
    const nextSort = rows.length;
    upsert.mutate({
      serviceId,
      row: {
        custom_field_id: selectedFieldId || null,
        calc_type: 1,
        from_val: 0,
        to_val: null,
        rate_cents: 0,
        budgeted_hours: 0,
        budgeted_cost_cents: 0,
        sort_order: nextSort,
        is_tail_row: false,
        tail_every_qty: null,
        tail_over_qty: null,
      },
    }, {
      onError: () => toast.error("Failed to add rate matrix row"),
    });
  }

  function saveField(rowId: string, field: string, rawValue: string | boolean) {
    let value: string | number | boolean | null = rawValue;
    if (typeof rawValue === "string") {
      if (field.endsWith("_cents")) {
        value = parseCents(rawValue);
      } else if (["from_val", "to_val", "budgeted_hours", "tail_every_qty", "tail_over_qty"].includes(field)) {
        value = rawValue === "" ? null : parseNum(rawValue);
      } else if (field === "calc_type") {
        value = parseInt(rawValue, 10) as 0 | 1;
      }
    }
    upsert.mutate({ serviceId, row: { id: rowId, [field]: value } }, {
      onError: () => toast.error("Failed to save rate matrix row"),
    });
  }

  function handleFieldChange(newFieldId: string) {
    setSelectedFieldId(newFieldId);
    for (const row of rows) {
      upsert.mutate({ serviceId, row: { id: row.id, custom_field_id: newFieldId || null } }, {
        onError: () => toast.error("Failed to update lookup field"),
      });
    }
  }

  const inputCls =
    "w-full rounded border border-slate-200 px-1.5 py-0.5 text-right text-xs focus:outline-none focus:border-brand-400";

  return (
    <div className="flex flex-col gap-4">
      <Field label="Lookup field">
        <Select
          value={selectedFieldId || "none"}
          onValueChange={(v) => handleFieldChange(v === "none" ? "" : v)}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Select a numeric property field…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {numericFieldDefs.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-3 py-2 text-left">From</th>
              <th className="px-3 py-2 text-left">To</th>
              <th className="px-3 py-2 text-left">Calc Type</th>
              <th className="px-3 py-2 text-right">Rate ($)</th>
              <th className="px-3 py-2 text-right">Hours</th>
              <th className="px-3 py-2 text-right">Cost ($)</th>
              <th className="px-3 py-2 text-center">Tail?</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400 text-xs">
                  No rows yet. Click Add Row to get started.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <input type="number" defaultValue={row.fromVal}
                    onBlur={(e) => saveField(row.id, "from_val", e.target.value)} className={inputCls} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" defaultValue={row.toVal ?? ""} placeholder="∞"
                    onBlur={(e) => saveField(row.id, "to_val", e.target.value)} className={inputCls} />
                </td>
                <td className="px-2 py-1.5">
                  <select defaultValue={String(row.calcType)}
                    onChange={(e) => saveField(row.id, "calc_type", e.target.value)}
                    className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-400 bg-white">
                    <option value="1">Per Unit</option>
                    <option value="0">Fixed</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" defaultValue={(row.rateCents / 100).toFixed(2)}
                    onBlur={(e) => saveField(row.id, "rate_cents", e.target.value)} className={inputCls} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" defaultValue={row.budgetedHours}
                    onBlur={(e) => saveField(row.id, "budgeted_hours", e.target.value)} className={inputCls} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" defaultValue={(row.budgetedCostCents / 100).toFixed(2)}
                    onBlur={(e) => saveField(row.id, "budgeted_cost_cents", e.target.value)} className={inputCls} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Checkbox checked={row.isTailRow}
                    onCheckedChange={(v) => saveField(row.id, "is_tail_row", !!v)} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => deleteRow.mutate({ id: row.id, serviceId }, {
                      onError: () => toast.error("Failed to delete rate matrix row"),
                    })}
                    className="rounded p-0.5 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t bg-slate-50 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={addRow} className="text-xs">
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Row
          </Button>
          {!selectedFieldId && rows.length === 0 && (
            <span className="text-xs text-slate-400">Tip: pick a lookup field above so rows know what to measure against</span>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Tail rows apply when a property value exceeds all standard range rows. Mark a row as Tail to use it as the overflow rule.
      </p>
    </div>
  );
}

// ── Sub-services Tab ─────────────────────────────────────────────────────────

interface SubServicesTabProps {
  parentService: CRMService;
}

type AddMode = "new" | "existing" | null;

function SubServicesTab({ parentService }: SubServicesTabProps) {
  const { data: allServices = [] } = useCRMServices();
  const createService = useCreateCRMService();
  const updateService = useUpdateCRMService();

  const [addMode, setAddMode] = useState<AddMode>(null);
  const [newName, setNewName] = useState("");
  const [linkId, setLinkId] = useState("");

  const subServices = allServices.filter(
    (s) => s.parentServiceId === parentService.id && !s.deletedAt
  );

  // Services eligible to be linked: not deleted, not this service, not already a sub of something, not already a sub here
  const linkable = allServices.filter(
    (s) =>
      !s.deletedAt &&
      s.id !== parentService.id &&
      !s.parentServiceId &&
      s.parentServiceId !== parentService.id
  );

  async function handleAddNew() {
    if (!newName.trim()) return;
    try {
      await createService.mutateAsync({
        name: newName.trim(),
        category: parentService.category,
        unit: parentService.unit,
        service_mode: parentService.serviceMode,
        parent_service_id: parentService.id,
        is_active: true,
        show_in_snow_dispatch: false,
        only_for_estimates: false,
        track_chemicals: false,
        task_color: parentService.taskColor,
        rate_matrix_calc: "qty_x_rate_x_visits",
      } as Parameters<typeof createService.mutateAsync>[0]);
      setNewName("");
      setAddMode(null);
    } catch {
      toast.error("Failed to create sub-service");
    }
  }

  async function handleLink() {
    if (!linkId) return;
    try {
      await updateService.mutateAsync({ id: linkId, patch: { parent_service_id: parentService.id } });
      setLinkId("");
      setAddMode(null);
    } catch {
      toast.error("Failed to link sub-service");
    }
  }

  async function handleRemove(s: CRMService) {
    try {
      await updateService.mutateAsync({ id: s.id, patch: { parent_service_id: null } });
    } catch {
      toast.error("Failed to remove sub-service");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        Sub-services appear as nested line items under <strong>{parentService.name}</strong> on estimates and jobs.
      </p>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b font-medium text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">Default Rate</th>
              <th className="px-3 py-2 text-right">B.Hrs</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {subServices.length === 0 && !addMode && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-xs">
                  No sub-services yet.
                </td>
              </tr>
            )}
            {subServices.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-slate-800">{s.name}</td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {s.defaultRateCents != null ? `$${(s.defaultRateCents / 100).toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {s.defaultBHrs > 0 ? s.defaultBHrs : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => handleRemove(s)}
                    className="rounded p-0.5 hover:bg-red-50 text-slate-400 hover:text-red-500"
                    title="Remove from parent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}

            {/* Add new inline row */}
            {addMode === "new" && (
              <tr className="border-b bg-slate-50">
                <td className="px-2 py-2" colSpan={4}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="New sub-service name…"
                      className="h-7 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddNew(); if (e.key === "Escape") setAddMode(null); }}
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddNew} disabled={!newName.trim() || createService.isPending}>
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddMode(null)}>Cancel</Button>
                  </div>
                </td>
              </tr>
            )}

            {/* Link existing inline row */}
            {addMode === "existing" && (
              <tr className="border-b bg-slate-50">
                <td className="px-2 py-2" colSpan={4}>
                  <div className="flex items-center gap-2">
                    <Select value={linkId || "none"} onValueChange={(v) => setLinkId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Select existing service…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a service…</SelectItem>
                        {linkable.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-7 text-xs" onClick={handleLink} disabled={!linkId || updateService.isPending}>
                      Link
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddMode(null)}>Cancel</Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {addMode === null && (
          <div className="p-2 border-t bg-slate-50 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAddMode("new")} className="text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" /> New sub-service
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAddMode("existing")} className="text-xs text-slate-500">
              Link existing
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        To edit a sub-service&apos;s rates, find it in the services list and open it directly.
      </p>
    </div>
  );
}

// ── Chemicals Tab ─────────────────────────────────────────────────────────────
// Default chemical products for a chemical-tracking service (SA's "Products &
// Mixes" tab) — these pre-populate the per-visit Chemical Application panel.

interface ChemicalsTabProps {
  serviceId: string;
}

function ChemicalsTab({ serviceId }: ChemicalsTabProps) {
  const { data: serviceChemicals = [] } = useServiceChemicals(serviceId);
  const { data: allProducts = [] } = useProducts();
  const saveChemicals = useSaveServiceChemicals();

  const chemicalProducts = allProducts.filter((p) => p.trackChemicals && !p.deletedAt);
  const [addingProductId, setAddingProductId] = useState("");

  function persist(next: { productId: string; startDate: string | null; endDate: string | null }[]) {
    saveChemicals.mutate({ serviceId, chemicals: next }, {
      onError: () => toast.error("Failed to save chemical products"),
    });
  }

  function handleAdd() {
    if (!addingProductId) return;
    persist([
      ...serviceChemicals.map((c) => ({ productId: c.productId, startDate: c.startDate, endDate: c.endDate })),
      { productId: addingProductId, startDate: null, endDate: null },
    ]);
    setAddingProductId("");
  }

  function handleRemove(productId: string) {
    persist(
      serviceChemicals
        .filter((c) => c.productId !== productId)
        .map((c) => ({ productId: c.productId, startDate: c.startDate, endDate: c.endDate }))
    );
  }

  function handleDateChange(productId: string, field: "startDate" | "endDate", value: string) {
    persist(
      serviceChemicals.map((c) =>
        c.productId === productId ? { productId: c.productId, startDate: c.startDate, endDate: c.endDate, [field]: value || null } : { productId: c.productId, startDate: c.startDate, endDate: c.endDate }
      )
    );
  }

  const linkable = chemicalProducts.filter((p) => !serviceChemicals.some((c) => c.productId === p.id));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        Chemical products attached here are pre-loaded onto every visit for this service — techs
        don&apos;t need to re-select them each time. Optional Start/End dates support seasonal rotation.
      </p>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b font-medium text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Start Date</th>
              <th className="px-3 py-2 text-left">End Date</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {serviceChemicals.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-xs">
                  No chemicals attached yet.
                </td>
              </tr>
            )}
            {serviceChemicals.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-slate-800">{c.productName ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="date"
                    defaultValue={c.startDate ?? ""}
                    onBlur={(e) => handleDateChange(c.productId, "startDate", e.target.value)}
                    className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-400"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="date"
                    defaultValue={c.endDate ?? ""}
                    onBlur={(e) => handleDateChange(c.productId, "endDate", e.target.value)}
                    className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-400"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => handleRemove(c.productId)}
                    className="rounded p-0.5 hover:bg-red-50 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t bg-slate-50 flex items-center gap-2">
          <Select value={addingProductId || "none"} onValueChange={(v) => setAddingProductId(v === "none" ? "" : v)}>
            <SelectTrigger className="h-7 w-64 text-xs">
              <SelectValue placeholder="Select a chemical product…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a chemical product…</SelectItem>
              {linkable.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={!addingProductId}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
          {chemicalProducts.length === 0 && (
            <span className="text-xs text-slate-400">
              No chemical products yet — mark a product &quot;Track Chemicals&quot; in the Products catalog.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────

export function ServiceDialog({ open, service, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("details");
  const [form, setForm] = useState<FormState>(emptyForm());
  // Tracks the saved service — set from prop on open, or updated after create so tabs unlock immediately
  const [activeService, setActiveService] = useState<CRMService | null>(service);

  const { data: allServices = [] } = useCRMServices();
  const createService = useCreateCRMService();
  const updateService = useUpdateCRMService();
  const { data: categoryOptions } = useOrgList("service_categories");
  const categories = categoryOptions && categoryOptions.length > 0
    ? categoryOptions.map((o) => o.value)
    : FALLBACK_CATEGORIES;

  useEffect(() => {
    if (open) {
      setTab("details");
      setActiveService(service);
      setForm(service ? serviceToForm(service) : emptyForm());
    }
  }, [open, service]);

  function buildPatch() {
    return {
      name: form.name.trim(),
      code: form.code.trim() || null,
      category: form.category,
      unit: form.unit,
      service_mode: form.serviceMode,
      parent_service_id: form.parentServiceId || null,
      default_rate_cents: form.defaultRateCents ? parseCents(form.defaultRateCents) : null,
      default_b_hrs: parseNum(form.defaultBHrs),
      default_b_cost_cents: parseCents(form.defaultBCostCents),
      budget_method: form.budgetMethod,
      production_rate_sqft_per_hr: form.productionRateSqftPerHr ? parseNum(form.productionRateSqftPerHr) : null,
      target_rate_cents: parseCents(form.targetRateCents),
      target_rate_with_drive_cents: parseCents(form.targetRateWithDriveCents),
      task_color: form.taskColor,
      is_active: form.isActive,
      show_in_snow_dispatch: form.showInSnowDispatch,
      only_for_estimates: form.onlyForEstimates,
      track_chemicals: form.trackChemicals,
      invoice_description: form.invoiceDescription.trim() || null,
      description_on_estimate: form.descriptionOnEstimate.trim() || null,
      rate_matrix_field: form.rateMatrixField || null,
      rate_matrix_calc: form.rateMatrixCalc,
      matrix_tail_every_qty: form.matrixTailEveryQty ? parseNum(form.matrixTailEveryQty) : null,
      matrix_tail_over_qty: form.matrixTailOverQty ? parseNum(form.matrixTailOverQty) : null,
      matrix_tail_rate_cents: form.matrixTailRateCents ? parseCents(form.matrixTailRateCents) : null,
      matrix_tail_hours: form.matrixTailHours ? parseNum(form.matrixTailHours) : null,
      matrix_tail_cost_cents: form.matrixTailCostCents ? parseCents(form.matrixTailCostCents) : null,
    };
  }

  async function handleSave() {
    const patch = buildPatch();
    try {
      if (activeService) {
        await updateService.mutateAsync({ id: activeService.id, patch });
        onClose();
      } else {
        // Create — stay open and unlock Rate Matrix / Sub-services tabs
        const created = await createService.mutateAsync(patch);
        setActiveService(created as CRMService);
        setForm(serviceToForm(created as CRMService));
      }
    } catch {
      toast.error("Failed to save service");
    }
  }

  const isPending = createService.isPending || updateService.isPending;

  // Services that can be a parent: top-level (no parent), not this service itself
  const parentCandidates = allServices.filter(
    (s) => !s.deletedAt && !s.parentServiceId && s.id !== activeService?.id
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle>
            {activeService ? `Edit Service: ${activeService.name}` : "Add Service"}
          </DialogTitle>
          {activeService && !service && (
            <p className="text-xs text-green-600 font-medium">Service created — you can now configure Rate Matrix and Sub-services.</p>
          )}
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-0 border-b text-sm shrink-0 px-6">
          {([
            { key: "details", label: "Details" },
            { key: "descriptions", label: "Descriptions" },
            { key: "rate_matrix", label: "Rate Matrix", disabled: !activeService },
            { key: "sub_services", label: "Sub-services", disabled: !activeService },
            ...(form.trackChemicals
              ? [{ key: "chemicals" as Tab, label: "Chemicals", disabled: !activeService }]
              : []),
            { key: "job_costing", label: "Job Costing", disabled: !activeService },
            { key: "audit", label: "Audit Trail", disabled: !activeService },
          ] as { key: Tab; label: string; disabled?: boolean }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => !t.disabled && setTab(t.key)}
              disabled={t.disabled}
              className={`px-4 py-2 border-b-2 transition-colors font-medium
                ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}
                ${t.disabled ? "opacity-40 cursor-not-allowed" : ""}
              `}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6">

        {/* Details Tab */}
        {tab === "details" && (
          <div className="flex flex-col gap-4 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Service Name *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Lawn Mowing"
                  className="text-sm"
                />
              </Field>
              <Field label="Service Code">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. MOW"
                  className="text-sm"
                />
              </Field>
              <Field label="Category">
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unit">
                <Select
                  value={form.unit}
                  onValueChange={(v) => setForm({ ...form, unit: v })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Service Mode">
                <Select
                  value={form.serviceMode}
                  onValueChange={(v) => setForm({ ...form, serviceMode: v })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat_rate">Flat Rate</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="per_unit">Per Unit</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Parent Service">
                <Select
                  value={form.parentServiceId || "none"}
                  onValueChange={(v) => setForm({ ...form, parentServiceId: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="None (top-level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    {parentCandidates
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Task Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.taskColor}
                    onChange={(e) => setForm({ ...form, taskColor: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded border border-slate-200 p-0.5"
                  />
                  <span className="text-xs text-slate-500">{form.taskColor}</span>
                </div>
              </Field>
            </div>

            {/* Pricing defaults */}
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">Pricing Defaults</p>

              <Field label="Budget Method">
                <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5 w-fit">
                  {([
                    { value: "manual", label: "Manual Budget Rate" },
                    { value: "production_rate", label: "Production Rate" },
                  ] as { value: BudgetMethod; label: string }[]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, budgetMethod: opt.value })}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        form.budgetMethod === opt.value
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {form.budgetMethod === "manual"
                    ? "Budgeted hours are entered directly below (Default B.Hrs)."
                    : "Budgeted hours are calculated per job from quantity ÷ production rate."}
                </p>
              </Field>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Default Rate ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.defaultRateCents}
                    onChange={(e) => setForm({ ...form, defaultRateCents: e.target.value })}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </Field>
                <Field label="Default B.Hrs">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.defaultBHrs}
                    onChange={(e) => setForm({ ...form, defaultBHrs: e.target.value })}
                    placeholder="0.00"
                    className="text-sm"
                    disabled={form.budgetMethod !== "manual"}
                  />
                </Field>
                <Field label="Default B.Cost ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.defaultBCostCents}
                    onChange={(e) => setForm({ ...form, defaultBCostCents: e.target.value })}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </Field>
                <Field label="Production Rate (sqft/hr)">
                  <Input
                    type="number"
                    step="1"
                    value={form.productionRateSqftPerHr}
                    onChange={(e) => setForm({ ...form, productionRateSqftPerHr: e.target.value })}
                    placeholder="e.g. 30000"
                    className="text-sm"
                    disabled={form.budgetMethod !== "production_rate"}
                  />
                </Field>
                <Field label="Target Rate ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.targetRateCents}
                    onChange={(e) => setForm({ ...form, targetRateCents: e.target.value })}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </Field>
                <Field label="Target Rate w/ Drive ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.targetRateWithDriveCents}
                    onChange={(e) => setForm({ ...form, targetRateWithDriveCents: e.target.value })}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </Field>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { key: "isActive",           label: "Active" },
                { key: "showInSnowDispatch", label: "Show in Snow Dispatch" },
                { key: "onlyForEstimates",   label: "Only for Estimates" },
                { key: "trackChemicals",     label: "Track Chemicals" },
              ] as { key: keyof FormState; label: string }[]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form[key] as boolean}
                    onCheckedChange={(v) => setForm({ ...form, [key]: !!v })}
                  />
                  <span className="text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Descriptions Tab */}
        {tab === "descriptions" && (
          <div className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-slate-600">Estimate Description</Label>
              <p className="text-xs text-slate-400">Shown to clients on estimates. Supports rich formatting.</p>
              <RichTextEditor
                value={form.descriptionOnEstimate}
                onChange={(html) => setForm({ ...form, descriptionOnEstimate: html })}
                placeholder="Enter the description that appears on estimates…"
                minHeight={150}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-slate-600">Invoice Description</Label>
              <p className="text-xs text-slate-400">Shown on invoices for this service line item.</p>
              <RichTextEditor
                value={form.invoiceDescription}
                onChange={(html) => setForm({ ...form, invoiceDescription: html })}
                placeholder="Enter the description that appears on invoices…"
                minHeight={120}
              />
            </div>
          </div>
        )}

        {/* Rate Matrix Tab */}
        {tab === "rate_matrix" && activeService && (
          <div className="py-2">
            <RateMatrixTab serviceId={activeService.id} />
          </div>
        )}

        {/* Sub-services Tab */}
        {tab === "sub_services" && activeService && (
          <div className="py-2">
            <SubServicesTab parentService={activeService} />
          </div>
        )}

        {/* Chemicals Tab */}
        {tab === "chemicals" && activeService && (
          <div className="py-2">
            <ChemicalsTab serviceId={activeService.id} />
          </div>
        )}

        {/* Job Costing Tab */}
        {tab === "job_costing" && activeService && (
          <ServiceJobCostingTab serviceId={activeService.id} />
        )}

        {/* Audit Trail Tab */}
        {tab === "audit" && activeService && (
          <div className="py-2">
            <AuditTrailTab recordType="service" recordId={activeService.id} />
          </div>
        )}

        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
            {isPending ? "Saving…" : activeService ? "Save Changes" : "Create & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
