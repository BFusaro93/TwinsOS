"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThumbnailUpload } from "@/components/shared/ThumbnailUpload";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EditButton } from "@/components/shared/EditButton";
import { QtyAdjustControl } from "@/components/shared/QtyAdjustControl";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { PartAssetsTab } from "@/components/cmms/PartAssetsTab";
import { NewPartDialog } from "@/components/cmms/NewPartDialog";
import { useParts, useUpdatePart } from "@/lib/hooks/use-parts";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useProducts } from "@/lib/hooks/use-products";
import { ShoppingCart, X } from "lucide-react";
import type { Part } from "@/types";

interface PartDetailSheetProps {
  part: Part | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function DetailsTab({
  part,
  allParts,
  onOrderQty,
  qtyOnHand,
  setQtyOnHand,
  linkedProductName,
  onPartClick,
}: {
  part: Part;
  allParts: Part[];
  onOrderQty: number;
  qtyOnHand: number;
  setQtyOnHand: (n: number) => void;
  linkedProductName: string | null;
  onPartClick: (p: Part) => void;
}) {
  const isLowStock = part.isInventory && qtyOnHand <= part.minimumStock;

  const allVendors = [
    ...(part.vendorName ? [{ vendorId: part.vendorId ?? "", vendorName: part.vendorName }] : []),
    ...part.alternateVendors,
  ];

  const subParts = allParts.filter((p) => p.parentPartId === part.id);
  const parentPart = part.parentPartId ? allParts.find((p) => p.id === part.parentPartId) : null;
  // Siblings: other generic/alternate parts that share the same OEM parent
  const siblings = parentPart
    ? allParts.filter((p) => p.parentPartId === parentPart.id && p.id !== part.id)
    : [];

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* Purchasing catalog link */}
      {linkedProductName && (
        <div className="flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2">
          <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-brand-600" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-800">Linked to Purchasing Catalog</p>
            <p className="truncate text-xs text-brand-600">{linkedProductName}</p>
          </div>
          <Badge
            variant="outline"
            className="ml-auto shrink-0 border-brand-200 bg-white text-brand-700 text-[10px]"
          >
            maintenance part
          </Badge>
        </div>
      )}

      {/* Stock level */}
      {part.isInventory ? (
        <div
          className={`rounded-md border p-4 ${
            isLowStock ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Quantity on Hand
              </p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  isLowStock ? "text-red-700" : "text-green-700"
                }`}
              >
                {qtyOnHand}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Min Stock
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-700">{part.minimumStock}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isLowStock && (
              <Badge variant="outline" className="border-red-300 bg-red-100 text-red-700">
                Low Stock
              </Badge>
            )}
            {onOrderQty > 0 && (
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                {onOrderQty} on order
              </Badge>
            )}
          </div>
          <QtyAdjustControl value={qtyOnHand} onChange={setQtyOnHand} />
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-500">
            Not tracked as an inventory item — quantity and stock levels are not monitored for this part.
          </p>
        </div>
      )}

      {/* Details */}
      <dl>
        <MetaRow label="Part #" value={part.partNumber} />
        <MetaRow label="Category" value={part.category} />
        <MetaRow label="Unit Cost" value={formatCurrency(part.unitCost)} />
      </dl>

      {/* Vendors */}
      <Separator />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Vendors
        </p>
        {allVendors.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {allVendors.map((v, i) => (
              <div key={v.vendorId} className="flex items-center gap-2">
                <span className="text-sm text-slate-700">{v.vendorName}</span>
                {i === 0 && (
                  <Badge
                    variant="outline"
                    className="border-brand-200 bg-brand-50 text-brand-700 text-xs"
                  >
                    Primary
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No vendor assigned</p>
        )}
      </div>

      {/* Sub-parts (OEM → generics) */}
      {subParts.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Interchangeable / Generic Parts
            </p>
            <div className="flex flex-col gap-2">
              {subParts.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => onPartClick(sp)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:border-brand-200 hover:bg-brand-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-brand-700 hover:underline">{sp.name}</p>
                    <p className="text-xs text-slate-500">{sp.partNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">
                      {formatCurrency(sp.unitCost)}
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        !sp.isInventory
                          ? "text-slate-400"
                          : sp.quantityOnHand <= sp.minimumStock
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {sp.isInventory ? `${sp.quantityOnHand} on hand` : "Not tracked"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Interchangeable parts (generic → OEM parent + siblings) */}
      {parentPart && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Interchangeable Parts
            </p>
            <div className="flex flex-col gap-2">
              {/* OEM / name-brand parent */}
              <button
                onClick={() => onPartClick(parentPart)}
                className="flex w-full items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:border-brand-200 hover:bg-brand-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-brand-700 hover:underline">{parentPart.name}</p>
                  <p className="text-xs text-slate-500">{parentPart.partNumber}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                    OEM
                  </span>
                  <p className="text-sm font-medium text-slate-700">
                    {formatCurrency(parentPart.unitCost)}
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      !parentPart.isInventory
                        ? "text-slate-400"
                        : parentPart.quantityOnHand <= parentPart.minimumStock
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {parentPart.isInventory
                      ? `${parentPart.quantityOnHand} on hand`
                      : "Not tracked"}
                  </p>
                </div>
              </button>
              {/* Sibling generics (other alternates for the same OEM parent) */}
              {siblings.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => onPartClick(sp)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:border-brand-200 hover:bg-brand-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-brand-700 hover:underline">{sp.name}</p>
                    <p className="text-xs text-slate-500">{sp.partNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">
                      {formatCurrency(sp.unitCost)}
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        !sp.isInventory
                          ? "text-slate-400"
                          : sp.quantityOnHand <= sp.minimumStock
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {sp.isInventory ? `${sp.quantityOnHand} on hand` : "Not tracked"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {part.description && (
        <>
          <Separator />
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </p>
            <p className="text-sm text-slate-700">{part.description}</p>
          </div>
        </>
      )}

      <Separator />
      <dl>
        <MetaRow label="Added" value={formatDate(part.createdAt)} />
        <MetaRow label="Last Updated" value={formatDate(part.updatedAt)} />
      </dl>
    </div>
  );
}

function HistoryTab({ part, purchaseOrders }: { part: Part; purchaseOrders: ReturnType<typeof usePurchaseOrders>["data"] }) {
  const pos = (purchaseOrders ?? [])
    .filter((po) =>
      po.lineItems.some((li) => li.partNumber === part.partNumber)
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Build price history: one point per PO (take first matching line item's unitCost)
  const priceHistory = pos.map((po) => {
    const li = po.lineItems.find((l) => l.partNumber === part.partNumber)!;
    return {
      date: new Date(po.createdAt).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      unitCost: li.unitCost / 100, // convert cents to dollars for display
      fullDate: po.createdAt,
    };
  });

  return (
    <div className="p-6">
      {pos.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-slate-400">No purchase history found for this part.</p>
        </div>
      ) : (
        <>
          {/* Price trend chart */}
          {priceHistory.length > 1 && (
            <div className="mb-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Unit Cost Trend
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={priceHistory}
                  margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v.toLocaleString()}`}
                    width={56}
                  />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Unit Cost"]}
                    labelStyle={{ color: "#475569", fontSize: 12 }}
                    contentStyle={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="unitCost"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* PO table */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Purchase Orders
          </p>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">PO #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Date</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Cost</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...pos].reverse().map((po) => {
                  const li = po.lineItems.find((l) => l.partNumber === part.partNumber)!;
                  return (
                    <tr key={po.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs font-medium text-slate-800">
                        {po.poNumber}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{formatDate(po.createdAt)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{li.quantity}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {formatCurrency(li.unitCost)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge variant={po.status} label={po.status.replace(/_/g, " ")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function PartDetailSheet({ part, open, onOpenChange }: PartDetailSheetProps) {
  const { data: allParts } = useParts();
  const { data: requisitions } = useRequisitions();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: products } = useProducts();
  const { mutate: updatePart } = useUpdatePart();
  const [qtyOnHand, setQtyOnHand] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [nestedPart, setNestedPart] = useState<Part | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  // Native wheel/touch listeners to prevent react-remove-scroll (used by the
  // outer Radix Sheet) from blocking scroll inside this portal. React synthetic
  // handlers don't reach the native event propagation path for body-level portals.
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const stopProp = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", stopProp);
    el.addEventListener("touchmove", stopProp);
    return () => {
      el.removeEventListener("wheel", stopProp);
      el.removeEventListener("touchmove", stopProp);
    };
  }, [open]);

  if (!part || !open) return null;

  const effectiveQty = qtyOnHand ?? part.quantityOnHand;
  const partId = part.id;

  function handleQtyChange(n: number) {
    setQtyOnHand(n);
    updatePart({ id: partId, quantityOnHand: n });
  }

  // Match by productItemId FK first; fall back to part-number match for
  // cases where the link wasn't set explicitly (e.g. items added before the FK existed)
  const linkedProduct =
    (products ?? []).find(
      (p) =>
        p.category === "maintenance_part" &&
        (p.id === part.productItemId || p.partNumber === part.partNumber)
    ) ?? null;
  const linkedProductName = linkedProduct?.name ?? null;

  const activeReqStatuses = new Set(["draft", "pending_approval", "approved"]);
  const activePoStatuses = new Set(["requested", "pending", "approved", "partially_fulfilled"]);

  const onOrderQty =
    (requisitions ?? [])
      .filter((r) => activeReqStatuses.has(r.status))
      .flatMap((r) => r.lineItems)
      .filter((li) => li.partNumber === part.partNumber)
      .reduce((sum, li) => sum + li.quantity, 0) +
    (purchaseOrders ?? [])
      .filter((po) => activePoStatuses.has(po.status))
      .flatMap((po) => po.lineItems)
      .filter((li) => li.partNumber === part.partNumber)
      .reduce((sum, li) => sum + li.quantity, 0);

  // Rendered via portal so it sits above the primary asset sheet without being
  // nested inside the Radix Dialog tree — avoids react-remove-scroll blocking
  // scroll events inside this panel.
  return (
    <>
      {createPortal(
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={part.name}
          className="pointer-events-auto fixed inset-y-0 right-0 z-[200] flex w-[580px] flex-col overflow-hidden border-l bg-background shadow-xl"
        >
          {/* Header — pr-12 leaves a clean gap for the absolute X button */}
          <div className="relative shrink-0 border-b px-6 py-4 pr-12">
            <div className="flex items-start gap-3">
              <ThumbnailUpload
                imageUrl={part.pictureUrl}
                alt={part.name}
                size="md"
                onUpload={(url) => updatePart({ id: partId, pictureUrl: url })}
              />
              <div className="min-w-0 flex-1">
                {/* Name row: title on the left, Edit button on the right (in flow) */}
                <div className="flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">
                    {part.name}
                  </h2>
                  <EditButton onClick={() => setEditOpen(true)} />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 capitalize">
                    {part.category}
                  </span>
                </div>
              </div>
            </div>

            {/* Close button — absolute top-right, separate from Edit */}
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs — flex layout works reliably inside a non-Radix fixed div */}
          <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b px-6">
              <TabsList className="h-10 bg-transparent p-0">
                {["details", "assets & vehicles", "history", "audit trail"].map((v) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="h-10 rounded-none border-b-2 border-transparent px-4 pb-0 pt-0 text-sm font-medium text-slate-500 data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none capitalize"
                  >
                    {v}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <DetailsTab
                part={part}
                allParts={allParts ?? []}
                onOrderQty={onOrderQty}
                qtyOnHand={effectiveQty}
                setQtyOnHand={handleQtyChange}
                linkedProductName={linkedProductName}
                onPartClick={(p) => setNestedPart(p)}
              />
            </TabsContent>
            <TabsContent value="assets & vehicles" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <PartAssetsTab partId={part.id} partName={part.name} partNumber={part.partNumber} />
            </TabsContent>
            <TabsContent value="history" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <HistoryTab part={part} purchaseOrders={purchaseOrders} />
            </TabsContent>
            <TabsContent value="audit trail" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <AuditTrailTab recordType="part" recordId={part.id} />
            </TabsContent>
          </Tabs>
        </div>,
        document.body
      )}
      <NewPartDialog open={editOpen} onOpenChange={setEditOpen} initialData={part} />
      {/* Nested sheet for clicking interchangeable parts */}
      <PartDetailSheet
        part={nestedPart}
        open={!!nestedPart}
        onOpenChange={(o) => { if (!o) setNestedPart(null); }}
      />
    </>
  );
}
