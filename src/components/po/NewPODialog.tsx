"use client";

import { useState, useEffect } from "react";
import type { PurchaseOrder } from "@/types";
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
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from "@/lib/hooks/use-purchase-orders";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { formatCurrency } from "@/lib/utils";
import { getCatalogCost } from "@/lib/cost-methods";
import { useSettingsStore } from "@/stores/settings-store";
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
  itemType: "product" | "part"; // NEW
  projectId: string; // NEW — "none" = no project
}

const today = new Date().toISOString().split("T")[0];

export interface POPrefillItem {
  productKey: string;
  productName: string;
  partNumber: string;
  unitCost: number; // dollars
  quantity: number;
  projectId?: string | null;
}

interface POPrefillData {
  vendorId?: string;
  projectId?: string;
  items?: POPrefillItem[];
  requisitionId?: string;
}

interface NewPODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: PurchaseOrder | null;
  prefillData?: POPrefillData | null;
  onCreated?: (po: PurchaseOrder) => void;
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

export function NewPODialog({ open, onOpenChange, initialData, prefillData, onCreated }: NewPODialogProps) {
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

  const [vendorId, setVendorId] = useState("none");
  const [poDate, setPoDate] = useState(today);
  const [paymentType, setPaymentType] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(() => [emptyLineItem()]);
  const [taxRatePercent, setTaxRatePercent] = useState(() => String(orgTaxRate ?? 7));
  const [shippingCost, setShippingCost] = useState("");
  const { mutate: createPO, isPending: creating } = useCreatePurchaseOrder();
  const { mutate: updatePO, isPending: updating } = useUpdatePurchaseOrder();
  const saving = creating || updating;

  const isEditing = !!initialData;
  const rf = useRequiredFields("purchase_order");

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
      setVendorId(initialData.vendorId);
      setPoDate(initialData.poDate ?? today);
      setPaymentType(initialData.paymentType ?? "");
      setInvoiceNumber(initialData.invoiceNumber ?? "");
      setNotes(initialData.notes ?? "");
      setTaxRatePercent(String(initialData.taxRatePercent));
      setShippingCost(initialData.shippingCost > 0 ? (initialData.shippingCost / 100).toFixed(2) : "");
    }
  }, [open, initialData]);

  useEffect(() => {
    if (open && !initialData && prefillData) {
      if (prefillData.vendorId) setVendorId(prefillData.vendorId);
      if (prefillData.items?.length) {
        setLineItems(
          prefillData.items.map((item) => ({
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            productItemId: item.productKey,
            productItemName: item.productName,
            partNumber: item.partNumber,
            quantity: item.quantity,
            unitCost: item.unitCost,
            itemType: item.productKey.startsWith("part:") ? "part" : "product",
            // Per-item project takes priority; fall back to top-level prefillData.projectId
            projectId: item.projectId ?? prefillData.projectId ?? "none",
          }))
        );
      }
    }
  }, [open, initialData, prefillData]);

  const isValid = (isEditing
    ? vendorId !== "" && vendorId !== "none"
    : vendorId !== "" && vendorId !== "none" && lineItems.every((li) => li.productItemId !== ""))
    && (!rf.isRequired("notes") || notes.trim() !== "")
    && (!rf.isRequired("shipping_cost") || shippingCost !== "");

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
    setVendorId("none");
    setPoDate(today);
    setPaymentType("");
    setInvoiceNumber("");
    setNotes("");
    setLineItems([emptyLineItem()]);
    setTaxRatePercent("7");
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
              projectId: itemType === "part" ? "none" : li.projectId,
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
    const taxRate = parseFloat(taxRatePercent) || 0;
    const shippingCents = Math.round((parseFloat(shippingCost) || 0) * 100);

    if (isEditing && initialData) {
      // In edit mode, line items aren't shown — preserve the existing subtotal
      // and only recalculate sales tax and grand total from the updated rates.
      const salesTaxCents = Math.round(initialData.subtotal * (taxRate / 100));
      updatePO(
        {
          id: initialData.id,
          vendorId: vendorId !== "none" ? vendorId : null,
          vendorName: vendor?.name ?? initialData.vendorName,
          poDate: poDate || null,
          paymentType: (paymentType as import("@/types").PaymentType) || null,
          invoiceNumber: invoiceNumber || null,
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
    const now = new Date().toISOString();

    // Generate PO number: PO-{year}-{6-digit timestamp suffix}
    const poNumber = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const newPO: Omit<import("@/types").PurchaseOrder, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt"> = {
      poNumber,
      poDate: poDate || now.split("T")[0],
      invoiceNumber: invoiceNumber || null,
      status: "requested",
      vendorId,
      vendorName: vendor?.name ?? "Unknown Vendor",
      lineItems: lineItems.map((li) => ({
        id: "",
        productItemId: li.productItemId.replace(/^(product:|part:)/, ""),
        productItemName: li.productItemName,
        partNumber: li.partNumber,
        quantity: li.quantity,
        unitCost: Math.round(li.unitCost * 100),
        totalCost: Math.round(li.quantity * li.unitCost * 100),
        projectId: li.projectId === "none" ? null : li.projectId,
        notes: null,
      })),
      subtotal: subtotalCents,
      taxRatePercent: taxRate,
      salesTax: salesTaxCents,
      shippingCost: shippingCents,
      grandTotal: subtotalCents + salesTaxCents + shippingCents,
      requisitionId: prefillData?.requisitionId ?? null,
      paymentSubmittedToAP: false,
      paymentRemitted: false,
      paymentType: (paymentType as import("@/types").PaymentType) || null,
      paymentBookedInQB: false,
      notes: notes || null,
    };

    createPO(newPO, {
      onSuccess: (created) => {
        handleClose();
        onCreated?.(created);
      },
    });
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
                ? { ...li, productItemId: catalogId, productItemName: p.name, partNumber: p.partNumber, unitCost: p.unitCost / 100, itemType: "product" }
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
                ? { ...li, productItemId: catalogId, productItemName: p.name, partNumber: p.partNumber, unitCost: p.unitCost / 100, itemType: "part", projectId: "none" }
                : li
            )
          );
          setPendingLineItemId(null);
        }
      }}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
          <DialogDescription>Create a purchase order to send to a vendor.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[75vh] overflow-y-auto px-1">
            <div className="space-y-4 pb-4">
              {/* Vendor — full width, required */}
              <div className="grid gap-1.5">
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

              {/* PO Date + Payment Type + Invoice # — three columns */}
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="po-date">PO Date</Label>
                  <Input
                    id="po-date"
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="po-payment-type">Payment Type</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger id="po-payment-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="ach">ACH</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="po-invoice-number">Invoice # (optional)</Label>
                  <Input
                    id="po-invoice-number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-0000"
                  />
                </div>
              </div>

              {/* Notes — full width */}
              {rf.isVisible("notes") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="po-notes">Notes{rf.req("notes")}</Label>
                  <Textarea
                    id="po-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional instructions or context"
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

                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
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
                            const hasProjectRow = li.itemType === "product" && !!li.productItemId;
                            return (
                            <>
                            <tr key={li.id} className={!hasProjectRow ? "border-b" : ""}>
                              <td className="py-1.5 pr-2 align-top">
                                <CatalogItemCombobox
                                  products={allProducts}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="po-tax-rate">Tax Rate (%)</Label>
                      <Input
                        id="po-tax-rate"
                        type="number"
                        step="0.01"
                        min={0}
                        value={taxRatePercent}
                        onChange={(e) => setTaxRatePercent(e.target.value)}
                      />
                    </div>
                    {rf.isVisible("shipping_cost") && (
                      <div className="grid gap-1.5">
                        <Label htmlFor="po-shipping">Shipping / Other ($){rf.req("shipping_cost")}</Label>
                        <Input
                          id="po-shipping"
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="0.00"
                          value={shippingCost}
                          onChange={(e) => setShippingCost(e.target.value)}
                        />
                      </div>
                    )}
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

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Purchase Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
