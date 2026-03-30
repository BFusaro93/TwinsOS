"use client";

import { useState, useEffect } from "react";
import type { Requisition } from "@/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useProducts } from "@/lib/hooks/use-products";
import { useVendors } from "@/lib/hooks/use-vendors";
import { useParts } from "@/lib/hooks/use-parts";
import { useProjects } from "@/lib/hooks/use-projects";
import { useCreateRequisition, useUpdateRequisition } from "@/lib/hooks/use-requisitions";
import { formatCurrency } from "@/lib/utils";
import { getCatalogCost } from "@/lib/cost-methods";
import { useSettingsStore } from "@/stores/settings-store";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { CatalogItemCombobox } from "@/components/shared/CatalogItemCombobox";
import { NewVendorDialog } from "@/components/shared/NewVendorDialog";
import { NewProductDialog } from "@/components/po/NewProductDialog";
import { NewPartDialog } from "@/components/cmms/NewPartDialog";
import type { Vendor, ProductItem, Part } from "@/types";

interface DraftLineItem {
  id: string;
  productItemId: string;
  productItemName: string;
  partNumber: string;
  quantity: number;
  unitCost: number; // dollars (user input) — converted to cents on save
  itemType: "product" | "part";
  category: string; // product category: maintenance_part, stocked_material, project_material
  projectId: string; // "none" = no project
}

export interface PrefillItem {
  productKey: string;
  productName: string;
  partNumber: string;
  unitCost: number; // dollars
  quantity: number;
}

interface PrefillData {
  projectId?: string;
  items?: PrefillItem[];
  // single-item shorthand (legacy, kept for backward compat)
  productKey?: string;
  productName?: string;
  partNumber?: string;
  unitCost?: number;
  quantity?: number;
}

interface NewRequisitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Requisition | null;
  prefillData?: PrefillData | null;
}

function emptyLineItem(): DraftLineItem {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    productItemId: "",
    productItemName: "",
    partNumber: "",
    quantity: 1,
    unitCost: 0,
    itemType: "product",
    category: "",
    projectId: "none",
  };
}

type CatalogOption = {
  id: string;
  name: string;
  partNumber: string;
  unitCost: number;
  type: "product" | "part";
};

export function NewRequisitionDialog({ open, onOpenChange, initialData, prefillData }: NewRequisitionDialogProps) {
  const { data: products } = useProducts();
  const { data: vendors } = useVendors();
  const { data: parts = [] } = useParts();
  const { data: projects = [] } = useProjects();
  const { costMethod, taxRatePercent: orgTaxRate } = useSettingsStore();

  // Extra items created inline during this session
  const [extraVendors, setExtraVendors] = useState<Vendor[]>([]);
  const [extraProducts, setExtraProducts] = useState<ProductItem[]>([]);
  const [extraParts, setExtraParts] = useState<Part[]>([]);

  // Create-new dialog visibility
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [partDialogOpen, setPartDialogOpen] = useState(false);

  // Which line item row triggered a catalog create dialog
  const [pendingLineItemId, setPendingLineItemId] = useState<string | null>(null);

  const allVendors = [...(vendors ?? []), ...extraVendors];
  const allProducts = [...(products ?? []), ...extraProducts];
  const allParts = [...parts, ...extraParts];

  const [title, setTitle] = useState("");
  const [vendorId, setVendorId] = useState("none");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(() => [emptyLineItem()]);
  const [taxRatePercent, setTaxRatePercent] = useState(() => String(orgTaxRate ?? 7));
  const [shippingCost, setShippingCost] = useState("");

  const createRequisition = useCreateRequisition();
  const updateRequisition = useUpdateRequisition();
  const saving = createRequisition.isPending || updateRequisition.isPending;

  const isEditing = !!initialData;
  const rf = useRequiredFields("requisition");

  // Build unified catalog (includes inline-created items)
  const catalog: CatalogOption[] = [
    ...allProducts.map((p) => ({
      id: `product:${p.id}`,
      name: p.name,
      partNumber: p.partNumber,
      unitCost: p.unitCost,
      type: "product" as const,
    })),
    ...allParts.map((p) => ({
      id: `part:${p.id}`,
      name: p.name,
      partNumber: p.partNumber,
      unitCost: p.unitCost,
      type: "part" as const,
    })),
  ];

  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title);
      setVendorId(initialData.vendorId ?? "none");
      setNotes(initialData.notes ?? "");
      setTaxRatePercent(String(initialData.taxRatePercent));
      setShippingCost(initialData.shippingCost > 0 ? (initialData.shippingCost / 100).toFixed(2) : "");
    } else if (open && !initialData) {
      // Sync tax rate from org settings when creating a new requisition
      setTaxRatePercent(String(orgTaxRate ?? 7));
    }
  }, [open, initialData, orgTaxRate]);

  useEffect(() => {
    if (open && !initialData && prefillData) {
      const itemsToFill: PrefillItem[] =
        prefillData.items ??
        (prefillData.productKey
          ? [{ productKey: prefillData.productKey, productName: prefillData.productName ?? "", partNumber: prefillData.partNumber ?? "", unitCost: prefillData.unitCost ?? 0, quantity: prefillData.quantity ?? 1 }]
          : []);
      if (itemsToFill.length > 0) {
        setLineItems(
          itemsToFill.map((item) => ({
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            productItemId: item.productKey,
            productItemName: item.productName,
            partNumber: item.partNumber,
            quantity: item.quantity,
            unitCost: item.unitCost,
            itemType: item.productKey.startsWith("part:") ? "part" : "product",
            category: "",
            projectId: prefillData.projectId ?? "none",
          }))
        );
      }
    }
  }, [open, initialData, prefillData]);

  const isValid = (isEditing
    ? title.trim() !== ""
    : title.trim() !== "" && lineItems.every((li) => li.productItemId !== ""))
    && (!rf.isRequired("vendor") || (vendorId !== "" && vendorId !== "none"))
    && (!rf.isRequired("notes") || notes.trim() !== "");

  // Derived totals (all in dollars for display)
  const subtotalDollars = lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitCost,
    0
  );
  const taxRate = parseFloat(taxRatePercent) || 0;
  const taxDollars = subtotalDollars * (taxRate / 100);
  const shippingDollars = parseFloat(shippingCost) || 0;
  const grandTotalDollars = subtotalDollars + taxDollars + shippingDollars;

  function handleClose() {
    onOpenChange(false);
    setTitle("");
    setVendorId("none");
    setNotes("");
    setLineItems([emptyLineItem()]);
    setTaxRatePercent(String(orgTaxRate ?? 7));
    setShippingCost("");
    setExtraVendors([]);
    setExtraProducts([]);
    setExtraParts([]);
    setPendingLineItemId(null);
  }

  function handleAddLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function handleRemoveLineItem(id: string) {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  }

  function handleLineItemProductChange(id: string, catalogId: string) {
    const item = catalog.find((c) => c.id === catalogId);
    const itemType = catalogId.startsWith("part:") ? "part" : "product";
    // Look up the full record (with costLayers) to apply the active cost method
    const rawId = catalogId.replace(/^(product:|part:)/, "");
    const fullRecord = itemType === "part"
      ? allParts.find((p) => p.id === rawId)
      : allProducts.find((p) => p.id === rawId);
    const prefilledCost = fullRecord
      ? getCatalogCost(fullRecord.unitCost, fullRecord.costLayers, costMethod) / 100
      : (item ? item.unitCost / 100 : 0);
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === id
          ? {
              ...li,
              productItemId: catalogId,
              productItemName: item?.name ?? "",
              partNumber: item?.partNumber ?? "",
              unitCost: prefilledCost,
              itemType,
              category: fullRecord && "category" in fullRecord ? (fullRecord as { category: string }).category : "",
              projectId: itemType === "part" || (fullRecord && "category" in fullRecord && (fullRecord as { category: string }).category === "maintenance_part") ? "none" : li.projectId,
            }
          : li
      )
    );
  }

  function handleLineItemProjectChange(id: string, projectId: string) {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, projectId } : li))
    );
  }

  function handleLineItemQtyChange(id: string, qty: number) {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, quantity: qty } : li))
    );
  }

  function handleLineItemUnitCostChange(id: string, unitCost: number) {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, unitCost } : li))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const vendor = allVendors.find((v) => v.id === vendorId);
    const resolvedVendorId = vendorId !== "none" ? vendorId : null;
    const taxRate = parseFloat(taxRatePercent) || 0;
    const shippingCents = Math.round((parseFloat(shippingCost) || 0) * 100);

    if (isEditing && initialData) {
      // In edit mode, line items aren't shown — preserve the existing subtotal
      // and only recalculate sales tax and grand total from the updated rates.
      const salesTaxCents = Math.round(initialData.subtotal * (taxRate / 100));
      updateRequisition.mutate(
        {
          id: initialData.id,
          title,
          vendorId: resolvedVendorId,
          vendorName: vendor?.name ?? (resolvedVendorId ? initialData.vendorName : null),
          taxRatePercent: taxRate,
          shippingCost: shippingCents,
          salesTax: salesTaxCents,
          grandTotal: initialData.subtotal + salesTaxCents + shippingCents,
          notes: notes || null,
        },
        { onSuccess: () => handleClose() }
      );
      return;
    }

    const subtotalCents = Math.round(
      lineItems.reduce((sum, li) => sum + li.quantity * li.unitCost, 0) * 100
    );
    const salesTaxCents = Math.round(subtotalCents * (taxRate / 100));

    createRequisition.mutate(
      {
        title,
        vendorId: resolvedVendorId,
        vendorName: vendor?.name ?? null,
        lineItems: lineItems.map((li) => {
          // For part-type items, resolve to the part's linked product_item_id
          // (parts.product_item_id → product_items.id FK).
          // Using the raw part UUID would fail the FK constraint on requisition_line_items.
          let resolvedProductItemId: string;
          if (li.itemType === "part") {
            const rawId = li.productItemId.replace(/^part:/, "");
            const part = allParts.find((p) => p.id === rawId);
            resolvedProductItemId = part?.productItemId ?? "";
          } else {
            resolvedProductItemId = li.productItemId.replace(/^product:/, "");
          }
          return {
            id: "",
            productItemId: resolvedProductItemId,
            productItemName: li.productItemName,
            partNumber: li.partNumber,
            quantity: li.quantity,
            unitCost: Math.round(li.unitCost * 100),
            totalCost: Math.round(li.quantity * li.unitCost * 100),
            projectId: li.projectId === "none" ? null : li.projectId,
            notes: null,
          };
        }),
        subtotal: subtotalCents,
        taxRatePercent: taxRate,
        salesTax: salesTaxCents,
        shippingCost: shippingCents,
        grandTotal: subtotalCents + salesTaxCents + shippingCents,
        notes: notes || null,
      },
      { onSuccess: () => handleClose() }
    );
  }

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
    <NewProductDialog
      open={productDialogOpen}
      onOpenChange={setProductDialogOpen}
      onCreated={(p) => {
        setExtraProducts((prev) => [...prev, p]);
        if (pendingLineItemId) {
          const catalogId = `product:${p.id}`;
          setLineItems((prev) =>
            prev.map((li) =>
              li.id === pendingLineItemId
                ? { ...li, productItemId: catalogId, productItemName: p.name, partNumber: p.partNumber, unitCost: p.unitCost / 100, itemType: "product", category: p.category }
                : li
            )
          );
          setPendingLineItemId(null);
        }
      }}
    />
    <NewPartDialog
      open={partDialogOpen}
      onOpenChange={setPartDialogOpen}
      onCreated={(p) => {
        setExtraParts((prev) => [...prev, p]);
        if (pendingLineItemId) {
          const catalogId = `part:${p.id}`;
          setLineItems((prev) =>
            prev.map((li) =>
              li.id === pendingLineItemId
                ? { ...li, productItemId: catalogId, productItemName: p.name, partNumber: p.partNumber, unitCost: p.unitCost / 100, itemType: "part", category: "maintenance_part", projectId: "none" }
                : li
            )
          );
          setPendingLineItemId(null);
        }
      }}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-[680px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEditing ? "Edit Requisition" : "New Requisition"}</DialogTitle>
          <DialogDescription>Request materials or services for purchase.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-1">
            <div className="space-y-4 pb-4">
              {/* Title — full width */}
              <div className="grid gap-1.5">
                <Label htmlFor="req-title">
                  Title{rf.req("title")}
                </Label>
                <Input
                  id="req-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What are you requesting?"
                />
              </div>

              {/* Preferred Vendor — half width */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Vendor{rf.req("vendor")}</Label>
                  <VendorCombobox
                    vendors={allVendors}
                    value={vendorId}
                    onValueChange={setVendorId}
                    noneLabel="No preference"
                    onCreateNew={() => setVendorDialogOpen(true)}
                  />
                </div>
              </div>

              {/* Notes — full width */}
              {rf.isVisible("notes") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="req-notes">Notes{rf.req("notes")}</Label>
                  <Textarea
                    id="req-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional context or instructions"
                  />
                </div>
              )}

              {!isEditing && (
                <>
                  {/* Line Items Section */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Line Items
                    </p>

                    <div className="max-h-[35dvh] overflow-y-auto rounded border">
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="border-b text-left text-xs text-slate-500">
                            <th className="pb-1.5 pr-2 font-medium">
                              Item <span className="text-red-500">*</span>
                            </th>
                            <th className="w-20 pb-1.5 pr-2 font-medium">Qty</th>
                            <th className="w-28 pb-1.5 pr-2 font-medium">
                              Unit Cost ($)
                              {costMethod !== "manual" && (
                                <span className="ml-1 font-normal text-brand-500">
                                  · {costMethod.toUpperCase()}
                                </span>
                              )}
                            </th>
                            <th className="w-24 pb-1.5 pr-2 text-right font-medium">Total</th>
                            <th className="w-8 pb-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((li) => {
                            const hasProjectRow = li.itemType === "product" && li.category !== "maintenance_part" && !!li.productItemId;
                            return (
                            <>
                            <tr key={li.id} className={!hasProjectRow ? "border-b" : ""}>
                              <td className="py-1.5 pr-2 align-top">
                                <CatalogItemCombobox
                                  products={allProducts.filter((p) => p.category !== "maintenance_part")}
                                  parts={allParts}
                                  value={li.productItemId}
                                  onValueChange={(val) => handleLineItemProductChange(li.id, val)}
                                  size="sm"
                                  onCreateNewProduct={() => { setPendingLineItemId(li.id); setProductDialogOpen(true); }}
                                  onCreateNewPart={() => { setPendingLineItemId(li.id); setPartDialogOpen(true); }}
                                />
                              </td>
                              <td className="py-1.5 pr-2 align-top">
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-8 w-20 text-xs"
                                  value={li.quantity}
                                  onChange={(e) =>
                                    handleLineItemQtyChange(
                                      li.id,
                                      Math.max(1, parseInt(e.target.value) || 1)
                                    )
                                  }
                                />
                              </td>
                              <td className="py-1.5 pr-2 align-top">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="h-8 w-28 text-xs"
                                  value={li.unitCost}
                                  onChange={(e) =>
                                    handleLineItemUnitCostChange(
                                      li.id,
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                />
                                {costMethod !== "manual" && li.productItemId && (() => {
                                  const rawId = li.productItemId.replace(/^(product:|part:)/, "");
                                  const rec = li.itemType === "part"
                                    ? allParts.find((p) => p.id === rawId)
                                    : allProducts.find((p) => p.id === rawId);
                                  if (!rec) return null;
                                  const suggestion = getCatalogCost(rec.unitCost, rec.costLayers, costMethod) / 100;
                                  return (
                                    <p className="mt-0.5 text-[10px] text-slate-400">
                                      {costMethod.toUpperCase()}: {formatCurrency(Math.round(suggestion * 100))}
                                    </p>
                                  );
                                })()}
                              </td>
                              <td className="py-1.5 pr-2 align-top text-right text-xs tabular-nums">
                                {formatCurrency(Math.round(li.quantity * li.unitCost * 100))}
                              </td>
                              <td className="py-1.5 align-top">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-red-500"
                                  onClick={() => handleRemoveLineItem(li.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                            {hasProjectRow && (
                              <tr key={`${li.id}-project`} className="border-b">
                                <td className="pb-1.5 pr-2" />
                                <td colSpan={3} className="pb-1.5 pr-2">
                                  <Select
                                    value={li.projectId}
                                    onValueChange={(val) =>
                                      handleLineItemProjectChange(li.id, val)
                                    }
                                  >
                                    <SelectTrigger className="h-6 text-[10px] text-slate-500 border-slate-200">
                                      <SelectValue placeholder="Link project..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none" className="text-xs">
                                        No project
                                      </SelectItem>
                                      {projects.map((proj) => (
                                        <SelectItem
                                          key={proj.id}
                                          value={proj.id}
                                          className="text-xs"
                                        >
                                          {proj.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td />
                              </tr>
                            )}
                            </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLineItem}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Line Item
                    </Button>
                  </div>

                  {/* Tax / Shipping */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="req-tax-rate">Tax Rate (%)</Label>
                      <Input
                        id="req-tax-rate"
                        type="number"
                        step="0.01"
                        min={0}
                        value={taxRatePercent}
                        onChange={(e) => setTaxRatePercent(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="req-shipping">Shipping / Other ($)</Label>
                      <Input
                        id="req-shipping"
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0.00"
                        value={shippingCost}
                        onChange={(e) => setShippingCost(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Totals Summary */}
                  <div className="rounded-md bg-slate-50 p-3 space-y-1 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums">
                        {formatCurrency(Math.round(subtotalDollars * 100))}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({taxRate}%)</span>
                      <span className="tabular-nums">
                        {formatCurrency(Math.round(taxDollars * 100))}
                      </span>
                    </div>
                    {shippingDollars > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Shipping / Other</span>
                        <span className="tabular-nums">
                          {formatCurrency(Math.round(shippingDollars * 100))}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 font-semibold text-slate-900">
                      <span>Grand Total</span>
                      <span className="tabular-nums">
                        {formatCurrency(Math.round(grandTotalDollars * 100))}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Requisition"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
