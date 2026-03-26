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
import { useVendors } from "@/lib/hooks/use-vendors";
import { useCreateProduct, useUpdateProduct } from "@/lib/hooks/use-products";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { NewVendorDialog } from "@/components/shared/NewVendorDialog";
import type { ProductItem, Vendor } from "@/types";

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
    }
  }, [open, initialData]);

  const isValid = name.trim() !== "" && category !== "" && vendorId !== "";

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
    setExtraVendors([]);
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
      alternateVendors: [],
      isInventory,
      quantityOnHand: parseInt(quantityOnHand) || 0,
      pictureUrl: null,
      costLayers: [],
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
                Vendor <span className="text-red-500">*</span>
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

            {/* Unit Cost — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="product-unit-cost">Unit Cost ($)</Label>
              <Input
                id="product-unit-cost"
                type="number"
                step="0.01"
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
                step="0.01"
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
          </div>

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
