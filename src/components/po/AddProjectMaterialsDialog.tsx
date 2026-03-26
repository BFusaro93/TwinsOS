"use client";

import { useState } from "react";
import { Plus, Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CatalogItemCombobox } from "@/components/shared/CatalogItemCombobox";
import { useProducts } from "@/lib/hooks/use-products";
import { useParts } from "@/lib/hooks/use-parts";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { formatCurrency } from "@/lib/utils";

export interface AddMaterialsDraftItem {
  id: string;
  productKey: string;
  productName: string;
  partNumber: string;
  unitCost: number; // dollars
  quantity: number;
}

export type AddMaterialsDestination =
  | { type: "direct" }
  | { type: "existing_req"; reqId: string; reqNumber: string; reqTitle: string }
  | { type: "existing_po"; poId: string; poNumber: string; vendorName: string }
  | { type: "new_req" }
  | { type: "new_po" };

interface AddProjectMaterialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: AddMaterialsDraftItem[], destination: AddMaterialsDestination) => void;
}

function emptyItem(): AddMaterialsDraftItem {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    productKey: "",
    productName: "",
    partNumber: "",
    unitCost: 0,
    quantity: 1,
  };
}

type DestinationType = "existing_req" | "existing_po" | "new_req" | "new_po" | "direct";

export function AddProjectMaterialsDialog({
  open,
  onOpenChange,
  onConfirm,
}: AddProjectMaterialsDialogProps) {
  const { data: products = [] } = useProducts();
  const { data: parts = [] } = useParts();
  const { data: requisitions = [] } = useRequisitions();
  const { data: purchaseOrders = [] } = usePurchaseOrders();

  const [step, setStep] = useState<1 | 2>(1);
  const [items, setItems] = useState<AddMaterialsDraftItem[]>(() => [emptyItem()]);
  const [destinationType, setDestinationType] = useState<DestinationType>("new_req");
  const [existingReqId, setExistingReqId] = useState("none");
  const [existingPoId, setExistingPoId] = useState("none");

  const catalog = [
    ...products.map((p) => ({ key: `product:${p.id}`, name: p.name, partNumber: p.partNumber, unitCost: p.unitCost })),
    ...parts.map((p) => ({ key: `part:${p.id}`, name: p.name, partNumber: p.partNumber, unitCost: p.unitCost })),
  ];

  const openReqs = requisitions.filter((r) => !["closed", "rejected"].includes(r.status));
  const openPos = purchaseOrders.filter((po) => !["closed", "canceled", "completed"].includes(po.status));

  function handleProductChange(id: string, key: string) {
    const found = catalog.find((c) => c.key === key);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              productKey: key,
              productName: found?.name ?? "",
              partNumber: found?.partNumber ?? "",
              unitCost: found ? found.unitCost / 100 : 0,
            }
          : item
      )
    );
  }

  function handleClose() {
    onOpenChange(false);
    setStep(1);
    setItems([emptyItem()]);
    setDestinationType("new_req");
    setExistingReqId("none");
    setExistingPoId("none");
  }

  function handleConfirm() {
    const filled = items.filter((i) => i.productKey);
    if (!filled.length) return;

    let destination: AddMaterialsDestination;
    if (destinationType === "existing_req") {
      const req = openReqs.find((r) => r.id === existingReqId);
      if (!req) return;
      destination = { type: "existing_req", reqId: req.id, reqNumber: req.requisitionNumber, reqTitle: req.title };
    } else if (destinationType === "existing_po") {
      const po = openPos.find((p) => p.id === existingPoId);
      if (!po) return;
      destination = { type: "existing_po", poId: po.id, poNumber: po.poNumber, vendorName: po.vendorName ?? "" };
    } else {
      destination = { type: destinationType };
    }

    onConfirm(filled, destination);
    handleClose();
  }

  const filledItems = items.filter((i) => i.productKey);
  const canProceed = filledItems.length > 0;
  const canConfirm =
    destinationType === "direct" ||
    destinationType === "new_req" ||
    destinationType === "new_po" ||
    (destinationType === "existing_req" && existingReqId !== "none") ||
    (destinationType === "existing_po" && existingPoId !== "none");

  const totalCents = Math.round(
    filledItems.reduce((s, i) => s + i.quantity * i.unitCost * 100, 0)
  );

  const optionClass = (active: boolean) =>
    `flex cursor-pointer flex-col gap-2 overflow-hidden rounded-lg border p-3 transition-colors ${
      active ? "border-brand-500 bg-brand-50" : "hover:border-slate-300"
    }`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? "Select Materials"
              : `Add ${filledItems.length} item${filledItems.length !== 1 ? "s" : ""} to...`}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: item selection ── */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="pb-1.5 pr-2 font-medium">
                      Item <span className="text-red-500">*</span>
                    </th>
                    <th className="w-16 pb-1.5 pr-2 font-medium">Qty</th>
                    <th className="w-24 pb-1.5 pr-2 font-medium">Unit Cost ($)</th>
                    <th className="w-8 pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        <CatalogItemCombobox
                          products={products}
                          parts={parts}
                          value={item.productKey}
                          onValueChange={(val) => handleProductChange(item.id, val)}
                          size="sm"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-16 text-xs"
                          value={item.quantity}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id
                                  ? { ...i, quantity: Math.max(1, parseInt(e.target.value) || 1) }
                                  : i
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="h-8 w-24 text-xs"
                          value={item.unitCost}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id
                                  ? { ...i, unitCost: parseFloat(e.target.value) || 0 }
                                  : i
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                          onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalCents > 0 && (
              <div className="flex justify-end text-xs text-slate-500">
                Total: {formatCurrency(totalCents)}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
              className="w-fit gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Another Item
            </Button>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canProceed}
                onClick={() => setStep(2)}
                className="gap-1.5"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 2: destination picker ── */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">

              {/* Existing Requisition */}
              <label className={optionClass(destinationType === "existing_req")}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="destination"
                    value="existing_req"
                    checked={destinationType === "existing_req"}
                    onChange={() => setDestinationType("existing_req")}
                    className="accent-brand-600"
                  />
                  <span className="text-sm font-medium">Add to existing Requisition</span>
                </div>
                {destinationType === "existing_req" && (
                  <div className="pl-5 pr-3">
                    <Select value={existingReqId} onValueChange={setExistingReqId}>
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue placeholder="Select requisition..." />
                      </SelectTrigger>
                      <SelectContent>
                        {openReqs.length === 0 ? (
                          <SelectItem value="none" disabled>No open requisitions</SelectItem>
                        ) : (
                          openReqs.map((r) => (
                            <SelectItem key={r.id} value={r.id} className="text-xs">
                              {r.requisitionNumber} — {r.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </label>

              {/* Existing PO */}
              <label className={optionClass(destinationType === "existing_po")}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="destination"
                    value="existing_po"
                    checked={destinationType === "existing_po"}
                    onChange={() => setDestinationType("existing_po")}
                    className="accent-brand-600"
                  />
                  <span className="text-sm font-medium">Add to existing Purchase Order</span>
                </div>
                {destinationType === "existing_po" && (
                  <div className="pl-5 pr-3">
                    <Select value={existingPoId} onValueChange={setExistingPoId}>
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue placeholder="Select purchase order..." />
                      </SelectTrigger>
                      <SelectContent>
                        {openPos.length === 0 ? (
                          <SelectItem value="none" disabled>No open purchase orders</SelectItem>
                        ) : (
                          openPos.map((po) => (
                            <SelectItem key={po.id} value={po.id} className="text-xs">
                              {po.poNumber} — {po.vendorName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </label>

              {/* New Requisition */}
              <label className={optionClass(destinationType === "new_req")}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="destination"
                    value="new_req"
                    checked={destinationType === "new_req"}
                    onChange={() => setDestinationType("new_req")}
                    className="accent-brand-600"
                  />
                  <span className="text-sm font-medium">Create new Requisition</span>
                </div>
              </label>

              {/* New PO */}
              <label className={optionClass(destinationType === "new_po")}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="destination"
                    value="new_po"
                    checked={destinationType === "new_po"}
                    onChange={() => setDestinationType("new_po")}
                    className="accent-brand-600"
                  />
                  <span className="text-sm font-medium">Create new Purchase Order</span>
                </div>
              </label>

              {/* Direct */}
              <label className={optionClass(destinationType === "direct")}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="destination"
                    value="direct"
                    checked={destinationType === "direct"}
                    onChange={() => setDestinationType("direct")}
                    className="accent-brand-600"
                  />
                  <div>
                    <span className="text-sm font-medium">Add directly to project</span>
                    <p className="text-xs text-slate-500">No PO or requisition will be created</p>
                  </div>
                </div>
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
