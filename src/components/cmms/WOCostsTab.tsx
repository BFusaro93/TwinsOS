"use client";

import { useState } from "react";
import { Plus, Search, Wrench, Store, Package, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useParts } from "@/lib/hooks/use-parts";
import { useVendors } from "@/lib/hooks/use-vendors";
import { PartDetailSheet } from "@/components/cmms/PartDetailSheet";
import {
  useWOParts,
  useAddWOPart,
  useUpdateWOPart,
  useDeleteWOPart,
  useWOLabor,
  useAddWOLabor,
  useUpdateWOLabor,
  useDeleteWOLabor,
  useWOVendorCharges,
  useAddWOVendorCharge,
  useUpdateWOVendorCharge,
  useDeleteWOVendorCharge,
} from "@/lib/hooks/use-wo-costs";
import type { WOPart, WOLaborEntry, WOVendorCharge } from "@/types";

interface WOCostsTabProps {
  workOrderId: string;
}

// ── Shared row action buttons ─────────────────────────────────────────────────

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <td className="px-2 py-2 text-right">
      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </td>
  );
}

function SectionHeader({ icon, title, count, onAdd }: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
          <span className="ml-1.5 font-normal normal-case text-slate-300">({count})</span>
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add
      </Button>
    </div>
  );
}

// ── Parts section ─────────────────────────────────────────────────────────────

function PartsSection({ workOrderId }: { workOrderId: string }) {
  const { data: items = [] } = useWOParts(workOrderId);
  const { data: allParts = [] } = useParts();
  const { mutate: addPart, isPending: adding } = useAddWOPart();
  const { mutate: updatePart } = useUpdateWOPart();
  const { mutate: deletePart } = useDeleteWOPart();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const selectedPart = selectedPartId ? allParts.find((p) => p.id === selectedPartId) ?? null : null;
  const [editForm, setEditForm] = useState({ quantity: "", unitCost: "" });

  const linkedIds = new Set(items.map((p) => p.partId));
  const editingItem = editingId ? items.find((p) => p.id === editingId) ?? null : null;

  const available = allParts
    .filter((p) => !linkedIds.has(p.id) && p.deletedAt === null)
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.partNumber.toLowerCase().includes(search.toLowerCase())
    );

  function openEdit(item: WOPart) {
    setEditingId(item.id);
    setEditForm({
      quantity: String(item.quantity),
      unitCost: (item.unitCost / 100).toFixed(2),
    });
  }

  function saveEdit() {
    if (!editingId) return;
    const quantity = Math.max(1, parseInt(editForm.quantity, 10) || 1);
    const unitCost = Math.round(parseFloat(editForm.unitCost) * 100);
    updatePart(
      { id: editingId, workOrderId, quantity, unitCost: unitCost || (editingItem?.unitCost ?? 0) },
      { onSuccess: () => setEditingId(null) }
    );
  }

  function handleAdd(partId: string) {
    const part = allParts.find((p) => p.id === partId);
    if (!part) return;
    addPart(
      {
        workOrderId,
        partId: part.id,
        partName: part.name,
        partNumber: part.partNumber,
        quantity: qtyMap[partId] ?? 1,
        unitCost: part.unitCost,
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          setSearch("");
          setQtyMap({});
        },
      }
    );
  }

  const total = items.reduce((sum, p) => sum + p.quantity * p.unitCost, 0);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={<Package className="h-3.5 w-3.5" />}
        title="Parts"
        count={items.length}
        onAdd={() => setAddOpen(true)}
      />

      {items.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-slate-400">No parts added yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Part</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Part #</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Cost</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Subtotal</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const fullPart = allParts.find((ap) => ap.id === p.partId);
                return (
                <tr key={p.id} className="group border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {fullPart?.pictureUrl ? (
                        <img src={fullPart.pictureUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100">
                          <Package className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPartId(p.partId)}
                        className="text-left font-medium text-brand-600 hover:underline"
                      >
                        {p.partName}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{p.partNumber}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{p.quantity}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(p.unitCost)}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {formatCurrency(p.quantity * p.unitCost)}
                  </td>
                  <RowActions
                    onEdit={() => openEdit(p)}
                    onDelete={() => deletePart({ id: p.id, workOrderId })}
                  />
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">
                  Parts Total
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add Part dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Part</DialogTitle>
            <DialogDescription>Select a part from inventory to add to this work order.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name or part #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {available.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {search ? "No parts match your search." : "All parts are already added."}
              </p>
            ) : (
              <ul className="divide-y">
                {available.map((part) => (
                  <li key={part.id}>
                    <div className="flex items-center gap-3 px-1 py-2.5">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{part.name}</p>
                        <p className="text-xs text-slate-500">
                          {part.partNumber} · {formatCurrency(part.unitCost)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={qtyMap[part.id] ?? 1}
                          onChange={(e) =>
                            setQtyMap((prev) => ({ ...prev, [part.id]: Math.max(1, Number(e.target.value)) }))
                          }
                          className="h-7 w-16 text-center text-sm"
                        />
                        <Button size="sm" disabled={adding} onClick={() => handleAdd(part.id)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Part dialog */}
      <Dialog open={!!editingItem} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Part</DialogTitle>
            <DialogDescription>{editingItem?.partName} — {editingItem?.partNumber}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Quantity</label>
                <Input
                  type="number"
                  min={1}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Unit Cost ($)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editForm.unitCost}
                  onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
            </div>
            <Button onClick={saveEdit} className="mt-1">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <PartDetailSheet
        part={selectedPart}
        open={!!selectedPart}
        onOpenChange={(o) => { if (!o) setSelectedPartId(null); }}
      />
    </div>
  );
}

// ── Labor section ─────────────────────────────────────────────────────────────

type LaborForm = { technicianName: string; description: string; hours: string; hourlyRate: string };
const BLANK_LABOR: LaborForm = { technicianName: "", description: "", hours: "", hourlyRate: "" };

function LaborSection({ workOrderId }: { workOrderId: string }) {
  const { data: items = [] } = useWOLabor(workOrderId);
  const { mutate: addLabor, isPending: adding } = useAddWOLabor();
  const { mutate: updateLabor } = useUpdateWOLabor();
  const { mutate: deleteLabor } = useDeleteWOLabor();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LaborForm>(BLANK_LABOR);

  const isEditing = editingId !== null;

  function openAdd() {
    setEditingId(null);
    setForm(BLANK_LABOR);
    setDialogOpen(true);
  }

  function openEdit(item: WOLaborEntry) {
    setEditingId(item.id);
    setForm({
      technicianName: item.technicianName,
      description: item.description,
      hours: String(item.hours),
      hourlyRate: (item.hourlyRate / 100).toFixed(2),
    });
    setDialogOpen(true);
  }

  function save() {
    const hours = parseFloat(form.hours);
    const rate = Math.round(parseFloat(form.hourlyRate) * 100);
    if (!form.technicianName || !hours || !rate) return;

    if (isEditing && editingId) {
      updateLabor(
        { id: editingId, workOrderId, technicianName: form.technicianName, description: form.description, hours, hourlyRate: rate },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      addLabor(
        { workOrderId, technicianName: form.technicianName, description: form.description, hours, hourlyRate: rate },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  }

  const total = items.reduce((sum, l) => sum + l.hours * l.hourlyRate, 0);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={<Wrench className="h-3.5 w-3.5" />}
        title="Labor"
        count={items.length}
        onAdd={openAdd}
      />

      {items.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-slate-400">No labor entries yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Technician</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Description</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Hours</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Rate/hr</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Subtotal</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="group border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{l.technicianName}</td>
                  <td className="px-3 py-2 text-slate-600">{l.description || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{l.hours}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(l.hourlyRate)}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {formatCurrency(l.hours * l.hourlyRate)}
                  </td>
                  <RowActions
                    onEdit={() => openEdit(l)}
                    onDelete={() => deleteLabor({ id: l.id, workOrderId })}
                  />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">
                  Labor Total
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Labor Entry" : "Add Labor"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update the labor details below." : "Record labor time for this work order."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Technician Name</label>
              <Input
                placeholder="e.g. Casey Kleinman"
                value={form.technicianName}
                onChange={(e) => setForm((f) => ({ ...f, technicianName: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input
                placeholder="e.g. Hydraulic line replacement"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Hours</label>
                <Input
                  type="number"
                  min={0.25}
                  step={0.25}
                  placeholder="1.5"
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Rate / hr ($)</label>
                <Input
                  type="number"
                  min={0}
                  step={5}
                  placeholder="75.00"
                  value={form.hourlyRate}
                  onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                />
              </div>
            </div>
            <Button onClick={save} disabled={adding} className="mt-1">
              {isEditing ? "Save Changes" : adding ? "Adding…" : "Add Labor Entry"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Vendor Charges section ────────────────────────────────────────────────────

type VendorForm = { vendorId: string; vendorName: string; description: string; cost: string };
const BLANK_VENDOR: VendorForm = { vendorId: "", vendorName: "", description: "", cost: "" };

function VendorSection({ workOrderId }: { workOrderId: string }) {
  const { data: items = [] } = useWOVendorCharges(workOrderId);
  const { data: vendors = [] } = useVendors();
  const { mutate: addCharge, isPending: adding } = useAddWOVendorCharge();
  const { mutate: updateCharge } = useUpdateWOVendorCharge();
  const { mutate: deleteCharge } = useDeleteWOVendorCharge();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<VendorForm>(BLANK_VENDOR);
  const [vendorSearch, setVendorSearch] = useState("");

  const isEditing = editingId !== null;

  const filteredVendors = vendors
    .filter((v) => v.isActive && v.deletedAt === null)
    .filter((v) => !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()));

  function selectVendor(vendorId: string, vendorName: string) {
    setForm((f) => ({ ...f, vendorId, vendorName }));
    setVendorSearch("");
  }

  function openAdd() {
    setEditingId(null);
    setForm(BLANK_VENDOR);
    setVendorSearch("");
    setDialogOpen(true);
  }

  function openEdit(item: WOVendorCharge) {
    setEditingId(item.id);
    setForm({
      vendorId: item.vendorId ?? "",
      vendorName: item.vendorName,
      description: item.description,
      cost: (item.cost / 100).toFixed(2),
    });
    setVendorSearch("");
    setDialogOpen(true);
  }

  function save() {
    const costCents = Math.round(parseFloat(form.cost) * 100);
    if (!form.vendorName || !costCents) return;

    if (isEditing && editingId) {
      updateCharge(
        {
          id: editingId,
          workOrderId,
          vendorId: form.vendorId || null,
          vendorName: form.vendorName,
          description: form.description,
          cost: costCents,
        },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      addCharge(
        {
          workOrderId,
          vendorId: form.vendorId || null,
          vendorName: form.vendorName,
          description: form.description,
          cost: costCents,
        },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  }

  const total = items.reduce((sum, v) => sum + v.cost, 0);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={<Store className="h-3.5 w-3.5" />}
        title="Vendors / Repair Shops"
        count={items.length}
        onAdd={openAdd}
      />

      {items.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-slate-400">No vendor charges yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Vendor</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Description</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Cost</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="group border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{v.vendorName}</td>
                  <td className="px-3 py-2 text-slate-600">{v.description || "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {formatCurrency(v.cost)}
                  </td>
                  <RowActions
                    onEdit={() => openEdit(v)}
                    onDelete={() => deleteCharge({ id: v.id, workOrderId })}
                  />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">
                  Vendor Total
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Vendor Charge" : "Add Vendor / Repair Shop"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update the vendor charge details below." : "Record an outside vendor or repair shop charge."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* Vendor picker */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Vendor</label>
              {form.vendorName ? (
                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-800">{form.vendorName}</span>
                  <button
                    className="text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => setForm((f) => ({ ...f, vendorId: "", vendorName: "" }))}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search vendors or type a name…"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                  {vendorSearch && (
                    <div className="max-h-36 overflow-y-auto rounded-md border bg-white shadow-sm">
                      {filteredVendors.length > 0 ? (
                        filteredVendors.map((v) => (
                          <button
                            key={v.id}
                            className="flex w-full items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => selectVendor(v.id, v.name)}
                          >
                            {v.name}
                          </button>
                        ))
                      ) : (
                        <button
                          className="flex w-full items-start px-3 py-2 text-left text-sm text-brand-600 hover:bg-slate-50"
                          onClick={() => selectVendor("", vendorSearch)}
                        >
                          Use &ldquo;{vendorSearch}&rdquo; as vendor name
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input
                placeholder="e.g. Carburetor rebuild"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Total Cost ($)</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="185.00"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <Button onClick={save} disabled={adding} className="mt-1">
              {isEditing ? "Save Changes" : adding ? "Adding…" : "Add Charge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Cost Summary ──────────────────────────────────────────────────────────────

function CostSummary({
  parts,
  labor,
  vendors,
}: {
  parts: WOPart[];
  labor: WOLaborEntry[];
  vendors: WOVendorCharge[];
}) {
  const partsTotal = parts.reduce((s, p) => s + p.quantity * p.unitCost, 0);
  const laborTotal = labor.reduce((s, l) => s + l.hours * l.hourlyRate, 0);
  const vendorTotal = vendors.reduce((s, v) => s + v.cost, 0);
  const grandTotal = partsTotal + laborTotal + vendorTotal;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Cost Summary
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Parts</span>
          <span className="font-medium text-slate-800">{formatCurrency(partsTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Labor</span>
          <span className="font-medium text-slate-800">{formatCurrency(laborTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Vendors / Repair Shops</span>
          <span className="font-medium text-slate-800">{formatCurrency(vendorTotal)}</span>
        </div>
        <div className="mt-1 border-t border-slate-200 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Total Cost</span>
            <span className="text-base font-bold text-slate-900">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function WOCostsTab({ workOrderId }: WOCostsTabProps) {
  // Query all three datasets for the summary — sections manage their own queries internally
  const { data: parts = [] } = useWOParts(workOrderId);
  const { data: labor = [] } = useWOLabor(workOrderId);
  const { data: vendors = [] } = useWOVendorCharges(workOrderId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PartsSection workOrderId={workOrderId} />
      <Separator />
      <LaborSection workOrderId={workOrderId} />
      <Separator />
      <VendorSection workOrderId={workOrderId} />
      <Separator />
      <CostSummary parts={parts} labor={labor} vendors={vendors} />
    </div>
  );
}
