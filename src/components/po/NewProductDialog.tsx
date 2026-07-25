"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVendors } from "@/lib/hooks/use-vendors";
import { useCreateProduct, useUpdateProduct } from "@/lib/hooks/use-products";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { NewVendorDialog } from "@/components/shared/NewVendorDialog";
import { useSettingsStore } from "@/stores/settings-store";
import { Plus, Trash2 } from "lucide-react";
import type { ActiveIngredient, ProductItem, Vendor } from "@/types";

interface NewProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ProductItem | null;
  /** Called after a new product is saved; receives the created product object. */
  onCreated?: (product: ProductItem) => void;
}

export function NewProductDialog({ open, onOpenChange, initialData, onCreated }: NewProductDialogProps) {
  const { data: vendors } = useVendors();
  const isEditing = !!initialData;

  const [extraVendors, setExtraVendors] = useState<Vendor[]>([]);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);

  const allVendors = [...(vendors ?? []), ...extraVendors];

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [isInventory, setIsInventory] = useState(false);
  const [quantityOnHand, setQuantityOnHand] = useState("");
  const [minimumStock, setMinimumStock] = useState("0");
  const [partCategory, setPartCategory] = useState("none");
  const { partCategories } = useSettingsStore();
  const enabledPartCategories = partCategories.filter((c) => c.enabled);
  const isMaintPart = category === "maintenance_part";

  const [trackChemicals, setTrackChemicals] = useState(false);
  const [scientificName, setScientificName] = useState("");
  const [epaRegistrationNumber, setEpaRegistrationNumber] = useState("");
  const [epaUrl, setEpaUrl] = useState("");
  const [labelInstructions, setLabelInstructions] = useState("");
  const [routeSheetInstructions, setRouteSheetInstructions] = useState("");
  const [activeIngredients, setActiveIngredients] = useState<ActiveIngredient[]>([]);
  const [reEntryInterval, setReEntryInterval] = useState("");
  const [restrictedProduct, setRestrictedProduct] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "chemical">("details");

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setCategory(initialData.category);
      setPartNumber(initialData.partNumber);
      setVendorId(initialData.vendorId);
      setUnitCost((initialData.unitCost / 100).toFixed(2));
      setPrice((initialData.price / 100).toFixed(2));
      setDescription(initialData.description);
      setIsInventory(initialData.isInventory);
      setQuantityOnHand(String(initialData.quantityOnHand));
      setMinimumStock(String(initialData.minimumStock ?? 0));
      setPartCategory(initialData.partCategory ?? "none");
      setTrackChemicals(initialData.trackChemicals ?? false);
      setScientificName(initialData.scientificName ?? "");
      setEpaRegistrationNumber(initialData.epaRegistrationNumber ?? "");
      setEpaUrl(initialData.epaUrl ?? "");
      setLabelInstructions(initialData.labelInstructions ?? "");
      setRouteSheetInstructions(initialData.routeSheetInstructions ?? "");
      setActiveIngredients(initialData.activeIngredients ?? []);
      setReEntryInterval(initialData.reEntryInterval ?? "");
      setRestrictedProduct(initialData.restrictedProduct ?? false);
    }
  }, [open, initialData]);

  // If the user unchecks Track Chemicals while viewing that tab, fall back
  // to Details rather than leaving the dialog on a tab that no longer exists.
  useEffect(() => {
    if (!trackChemicals && activeTab === "chemical") setActiveTab("details");
  }, [trackChemicals, activeTab]);

  const isValid = name.trim() !== "" && category !== "";

  function handleClose() {
    onOpenChange(false);
    setName("");
    setCategory("");
    setPartNumber("");
    setVendorId("");
    setUnitCost("");
    setPrice("");
    setDescription("");
    setIsInventory(false);
    setQuantityOnHand("");
    setMinimumStock("0");
    setPartCategory("none");
    setTrackChemicals(false);
    setScientificName("");
    setEpaRegistrationNumber("");
    setEpaUrl("");
    setLabelInstructions("");
    setRouteSheetInstructions("");
    setActiveIngredients([]);
    setReEntryInterval("");
    setRestrictedProduct(false);
    setActiveTab("details");
    setExtraVendors([]);
    createProduct.reset();
    updateProduct.reset();
  }

  function addIngredient() {
    setActiveIngredients((prev) => [...prev, { name: "", percentage: 0 }]);
  }

  function updateIngredient(index: number, patch: Partial<ActiveIngredient>) {
    setActiveIngredients((prev) => prev.map((ai, i) => (i === index ? { ...ai, ...patch } : ai)));
  }

  function removeIngredient(index: number) {
    setActiveIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vendor = allVendors.find((v) => v.id === vendorId);
    const payload = {
      name,
      description,
      partNumber,
      category: category as ProductItem["category"],
      unitCost: Math.round((parseFloat(unitCost) || 0) * 100),
      price: Math.round((parseFloat(price) || 0) * 100),
      vendorId,
      vendorName: vendor?.name ?? "",
      // When editing, preserve fields not exposed in this form — never overwrite
      // pictureUrl or alternateVendors with blank/null on a plain description/cost edit.
      alternateVendors: isEditing && initialData ? initialData.alternateVendors : [],
      isInventory,
      quantityOnHand: parseInt(quantityOnHand) || 0,
      pictureUrl: isEditing && initialData ? initialData.pictureUrl : null,
      costLayers: isEditing && initialData ? initialData.costLayers : [],
      minimumStock: isMaintPart ? parseInt(minimumStock) || 0 : 0,
      partCategory: isMaintPart && partCategory !== "none" ? partCategory : null,
      trackChemicals,
      scientificName: trackChemicals ? scientificName || null : null,
      epaRegistrationNumber: trackChemicals ? epaRegistrationNumber || null : null,
      epaUrl: trackChemicals ? epaUrl || null : null,
      labelInstructions: trackChemicals ? labelInstructions || null : null,
      routeSheetInstructions: trackChemicals ? routeSheetInstructions || null : null,
      activeIngredients: trackChemicals
        ? activeIngredients.filter((ai) => ai.name.trim() !== "")
        : [],
      reEntryInterval: trackChemicals ? reEntryInterval || null : null,
      restrictedProduct: trackChemicals ? restrictedProduct : false,
    };

    if (isEditing && initialData) {
      updateProduct.mutate(
        { id: initialData.id, ...payload },
        { onSuccess: () => handleClose() }
      );
    } else {
      createProduct.mutate(payload, {
        onSuccess: (product) => {
          onCreated?.(product);
          handleClose();
        },
      });
    }
  }

  const saving = createProduct.isPending || updateProduct.isPending;
  const saveError = createProduct.error ?? updateProduct.error;

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
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "details" | "chemical")}>
            {/* Only worth showing a tab bar once there's a second tab to switch to —
                matches the underline style used on the read-only product sheet. */}
            {trackChemicals && (
              <div className="border-b">
                <TabsList className="h-9 bg-transparent p-0">
                  <TabsTrigger
                    value="details"
                    className="h-9 rounded-none border-b-2 border-transparent px-3 text-sm font-medium text-slate-500 data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
                  >
                    Details
                  </TabsTrigger>
                  <TabsTrigger
                    value="chemical"
                    className="h-9 rounded-none border-b-2 border-transparent px-3 text-sm font-medium text-slate-500 data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
                  >
                    Chemical
                  </TabsTrigger>
                </TabsList>
              </div>
            )}
            <TabsContent value="details" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Name — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="product-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product name"
              />
            </div>

            {/* Category — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="product-category">
                Category <span className="text-red-500">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="product-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance_part">Maintenance Part</SelectItem>
                  <SelectItem value="stocked_material">Stocked Material</SelectItem>
                  <SelectItem value="project_material">Project Material</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Part Number — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="product-part-number">Part Number</Label>
              <Input
                id="product-part-number"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="SKU or part #"
              />
            </div>

            {/* Vendor — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label>
                Vendor
              </Label>
              <VendorCombobox
                vendors={allVendors}
                value={vendorId}
                onValueChange={setVendorId}
                noneLabel="Select vendor"
                required
                onCreateNew={() => setVendorDialogOpen(true)}
              />
            </div>

            {/* Maintenance-part-only: part category + min stock */}
            {isMaintPart && (
              <>
                <div className="col-span-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
                    CMMS Settings
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="product-part-category">Part Category</Label>
                      <Select value={partCategory} onValueChange={setPartCategory}>
                        <SelectTrigger id="product-part-category">
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
                    <div className="grid gap-1.5">
                      <Label htmlFor="product-min-stock">Min Stock</Label>
                      <Input
                        id="product-min-stock"
                        type="number"
                        min={0}
                        step={1}
                        value={minimumStock}
                        onChange={(e) => setMinimumStock(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Unit Cost — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="product-unit-cost">Unit Cost ($)</Label>
              <Input
                id="product-unit-cost"
                type="number"
                step="any"
                placeholder="0.00"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>

            {/* Sale Price — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="product-price">Sale Price ($)</Label>
              <Input
                id="product-price"
                type="number"
                step="any"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            {/* Description — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            {/* Track inventory checkbox — full width */}
            <div className="col-span-2 grid gap-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="product-inventory"
                  checked={isInventory}
                  onCheckedChange={(checked) => setIsInventory(checked === true)}
                />
                <Label htmlFor="product-inventory" className="cursor-pointer font-normal">
                  Track inventory quantity
                </Label>
              </div>
            </div>

            {/* Quantity on hand — half width, shown only when isInventory */}
            {isInventory && (
              <div className="grid gap-1.5">
                <Label htmlFor="product-qty">Quantity on Hand</Label>
                <Input
                  id="product-qty"
                  type="number"
                  step="1"
                  placeholder="0"
                  value={quantityOnHand}
                  onChange={(e) => setQuantityOnHand(e.target.value)}
                />
              </div>
            )}

            {/* Chemical Tracking — full width */}
            <div className="col-span-2 grid gap-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="product-track-chemicals"
                  checked={trackChemicals}
                  onCheckedChange={(checked) => setTrackChemicals(checked === true)}
                />
                <Label htmlFor="product-track-chemicals" className="cursor-pointer font-normal">
                  Track Chemicals
                </Label>
              </div>
            </div>
          </div>
            </TabsContent>

            {trackChemicals && (
              <TabsContent value="chemical" className="mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="product-scientific-name">Scientific Name</Label>
                    <Input
                      id="product-scientific-name"
                      value={scientificName}
                      onChange={(e) => setScientificName(e.target.value)}
                      placeholder="Some states require this"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="product-epa-number">EPA Registration #</Label>
                    <Input
                      id="product-epa-number"
                      value={epaRegistrationNumber}
                      onChange={(e) => setEpaRegistrationNumber(e.target.value)}
                      placeholder="EPA Reg. No."
                    />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="product-epa-url">EPA URL</Label>
                    <Input
                      id="product-epa-url"
                      value={epaUrl}
                      onChange={(e) => setEpaUrl(e.target.value)}
                      placeholder="https://npic.orst.edu/... or epa.gov link"
                    />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="product-label-instructions">Label Instructions</Label>
                    <Textarea
                      id="product-label-instructions"
                      rows={2}
                      value={labelInstructions}
                      onChange={(e) => setLabelInstructions(e.target.value)}
                      placeholder="Shown to the technician applying this chemical"
                    />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="product-route-sheet-instructions">Client Route Sheet Instructions</Label>
                    <Textarea
                      id="product-route-sheet-instructions"
                      rows={2}
                      value={routeSheetInstructions}
                      onChange={(e) => setRouteSheetInstructions(e.target.value)}
                      placeholder="Printed for the client, e.g. watering/re-entry instructions"
                    />
                  </div>

                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="product-reentry-interval">Re-Entry Interval</Label>
                    <Input
                      id="product-reentry-interval"
                      value={reEntryInterval}
                      onChange={(e) => setReEntryInterval(e.target.value)}
                      placeholder="e.g. 24 hours, or until dry"
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <Checkbox
                      id="product-restricted"
                      checked={restrictedProduct}
                      onCheckedChange={(checked) => setRestrictedProduct(checked === true)}
                    />
                    <Label htmlFor="product-restricted" className="cursor-pointer font-normal">
                      Restricted Use Product
                    </Label>
                  </div>

                  <div className="col-span-2 grid gap-1.5">
                    <Label>Active Ingredients</Label>
                    {activeIngredients.map((ai, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={ai.name}
                          onChange={(e) => updateIngredient(i, { name: e.target.value })}
                          placeholder="Ingredient name"
                          className="flex-1"
                        />
                        <div className="relative w-28">
                          <Input
                            type="number"
                            step="any"
                            value={ai.percentage || ""}
                            onChange={(e) => updateIngredient(i, { percentage: parseFloat(e.target.value) || 0 })}
                            placeholder="0.0"
                            className="pr-6"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            %
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-500"
                          onClick={() => removeIngredient(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addIngredient}
                      className="w-fit gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Ingredient
                    </Button>
                  </div>
                </div>
                {isEditing && (
                  <p className="mt-2 text-xs text-brand-600/80">
                    Application rates can be managed from the product&apos;s detail panel after saving.
                  </p>
                )}
              </TabsContent>
            )}
          </Tabs>

          {saveError && (
            <p className="text-sm text-red-600">
              {saveError instanceof Error
                ? saveError.message
                : typeof saveError === "object" && saveError !== null && "message" in saveError
                  ? String((saveError as { message: unknown }).message)
                  : "Failed to save. Please try again."}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
