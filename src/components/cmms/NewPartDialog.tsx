"use client";

import { useState, useEffect } from "react";
import type { Part, Vendor } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVendors } from "@/lib/hooks/use-vendors";
import { useParts, useCreatePart, useUpdatePart } from "@/lib/hooks/use-parts";
import { useSettingsStore } from "@/stores/settings-store";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { NewVendorDialog } from "@/components/shared/NewVendorDialog";

interface NewPartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Part | null;
  /** Called after a new part is saved; receives the created part object. */
  onCreated?: (part: Part) => void;
}

export function NewPartDialog({ open, onOpenChange, initialData, onCreated }: NewPartDialogProps) {
  const isEditing = !!initialData;
  const { data: vendors } = useVendors();

  const [extraVendors, setExtraVendors] = useState<Vendor[]>([]);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const allVendors = [...(vendors ?? []), ...extraVendors];
  const { data: allParts } = useParts();
  const { partCategories, locations } = useSettingsStore();
  const enabledLocations = locations.filter((l) => l.enabled);
  const enabledPartCategories = partCategories.filter((c) => c.enabled);

  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [category, setCategory] = useState("none");
  const [quantityOnHand, setQuantityOnHand] = useState("0");
  const [minimumStock, setMinimumStock] = useState("0");
  const [unitCost, setUnitCost] = useState("");
  const [isInventory, setIsInventory] = useState(false);
  const [location, setLocation] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [description, setDescription] = useState("");
  const [parentPartId, setParentPartId] = useState("none");

  const createPart = useCreatePart();
  const updatePart = useUpdatePart();

  // Available parent parts (exclude the part being edited, exclude parts that already have a parent)
  const parentPartOptions = (allParts ?? []).filter(
    (p) => p.id !== initialData?.id && p.parentPartId === null
  );

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setPartNumber(initialData.partNumber);
      setCategory(initialData.category || "none");
      setQuantityOnHand(String(initialData.quantityOnHand));
      setMinimumStock(String(initialData.minimumStock));
      setUnitCost((initialData.unitCost / 100).toFixed(2));
      setIsInventory(initialData.isInventory);
      setLocation(initialData.location ?? "");
      setVendorId(initialData.vendorId ?? "");
      setDescription(initialData.description);
      setParentPartId(initialData.parentPartId ?? "none");
    }
  }, [open, initialData]);

  const isValid = name.trim() !== "" && partNumber.trim() !== "";

  function handleClose() {
    onOpenChange(false);
    setName("");
    setPartNumber("");
    setCategory("none");
    setQuantityOnHand("0");
    setMinimumStock("0");
    setUnitCost("");
    setIsInventory(false);
    setLocation("");
    setVendorId("");
    setDescription("");
    setParentPartId("none");
    setExtraVendors([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vendor = allVendors.find((v) => v.id === vendorId);
    const payload = {
      name,
      partNumber,
      description,
      category: category === "none" ? "" : category,
      quantityOnHand: parseInt(quantityOnHand) || 0,
      minimumStock: parseInt(minimumStock) || 0,
      unitCost: Math.round((parseFloat(unitCost) || 0) * 100),
      vendorId: vendorId || null,
      vendorName: vendor?.name ?? null,
      alternateVendors: initialData?.alternateVendors ?? [],
      parentPartId: parentPartId === "none" ? null : parentPartId,
      isInventory,
      location: location.trim() || null,
      pictureUrl: initialData?.pictureUrl ?? null,
      productItemId: initialData?.productItemId ?? null,
      costLayers: initialData?.costLayers ?? [],
    };

    if (isEditing && initialData) {
      updatePart.mutate(
        { id: initialData.id, ...payload },
        { onSuccess: () => handleClose() }
      );
    } else {
      createPart.mutate(payload, {
        onSuccess: (part) => {
          onCreated?.(part);
          handleClose();
        },
      });
    }
  }

  const saving = createPart.isPending || updatePart.isPending;

  return (
    <>
    <NewVendorDialog
      open={vendorDialogOpen}
      onOpenChange={setVendorDialogOpen}
      onCreated={(v) => {
        setExtraVendors((prev) => [...prev, v]);
        setVendorId(v.id);
      }}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Part" : "New Part"}</DialogTitle>
          <DialogDescription>
            Add a new part or consumable to the parts inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] sm:max-h-[70vh] overflow-y-auto px-1">
          <form id="new-part-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Basic Info */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Basic Info
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="part-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="part-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Part name"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="part-number">
                  Part Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="part-number"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  placeholder="e.g. BLD-4821"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="part-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="part-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {enabledPartCategories.map((c) => (
                      <SelectItem key={c.id} value={c.label}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Inventory */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Inventory
            </p>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is-inventory"
                checked={isInventory}
                onCheckedChange={(checked) => setIsInventory(checked === true)}
              />
              <Label htmlFor="is-inventory" className="cursor-pointer">
                Track as inventory item
              </Label>
            </div>

            {isInventory && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="qty-on-hand">Qty on Hand</Label>
                  <Input
                    id="qty-on-hand"
                    type="number"
                    min={0}
                    value={quantityOnHand}
                    onChange={(e) => setQuantityOnHand(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="min-stock">Min Stock</Label>
                  <Input
                    id="min-stock"
                    type="number"
                    min={0}
                    value={minimumStock}
                    onChange={(e) => setMinimumStock(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="unit-cost">Unit Cost ($)</Label>
              <Input
                id="unit-cost"
                type="number"
                step="0.01"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Location */}
            <div className="grid gap-1.5">
              <Label htmlFor="part-location">Location</Label>
              <Select value={location || "none"} onValueChange={(v) => setLocation(v === "none" ? "" : v)}>
                <SelectTrigger id="part-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No location</SelectItem>
                  {enabledLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.label}>{loc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendor */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Vendor
            </p>

            <div className="grid gap-1.5">
              <Label>Primary Vendor</Label>
              <VendorCombobox
                vendors={allVendors}
                value={vendorId || "none"}
                onValueChange={(v) => setVendorId(v === "none" ? "" : v)}
                noneLabel="No vendor"
                onCreateNew={() => setVendorDialogOpen(true)}
              />
            </div>

            {/* Details */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Details
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="part-description">Description</Label>
              <Textarea
                id="part-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes or description"
              />
            </div>

            {/* Sub-Part Relationship */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Interchangeability
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="parent-part">OEM / Parent Part</Label>
              <Select value={parentPartId} onValueChange={setParentPartId}>
                <SelectTrigger id="parent-part">
                  <SelectValue placeholder="Select parent part (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — this is a standalone or OEM part</SelectItem>
                  {parentPartOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.partNumber && (
                        <span className="ml-1.5 text-xs text-slate-400">#{p.partNumber}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                Link this part as a generic or interchangeable alternative to an OEM part.
              </p>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-part-form"
            disabled={!isValid || saving}
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Part"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
