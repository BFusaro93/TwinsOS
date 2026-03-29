"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ThumbnailUpload } from "@/components/shared/ThumbnailUpload";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditButton } from "@/components/shared/EditButton";
import { ManageVendorsDialog } from "@/components/shared/ManageVendorsDialog";
import { NewProductDialog } from "./NewProductDialog";
import { QtyAdjustControl } from "@/components/shared/QtyAdjustControl";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/constants";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useDeleteProduct, useUpdateProduct } from "@/lib/hooks/use-products";
import type { ProductItem } from "@/types";

interface ProductDetailSheetProps {
  product: ProductItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="col-span-2 text-sm text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function DetailsTab({
  product,
  onOrderQty,
  qtyOnHand,
  setQtyOnHand,
  onManageVendors,
}: {
  product: ProductItem;
  onOrderQty: number;
  qtyOnHand: number;
  setQtyOnHand: (n: number) => void;
  onManageVendors: () => void;
}) {
  const margin =
    product.price > 0
      ? (((product.price - product.unitCost) / product.price) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="p-6 flex flex-col gap-5">
      {product.isInventory && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Quantity on Hand
              </p>
              <p className="mt-1 text-2xl font-bold text-green-700">
                {qtyOnHand}
              </p>
            </div>
          </div>
          {onOrderQty > 0 && (
            <div className="mt-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                {onOrderQty} on order
              </Badge>
            </div>
          )}
          <QtyAdjustControl value={qtyOnHand} onChange={setQtyOnHand} />
        </div>
      )}

      <dl>
        <DetailRow
          label="Part #"
          value={product.partNumber}
        />
      </dl>

      <Separator />

      {/* Vendors */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vendors</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onManageVendors}>
            Manage
          </Button>
        </div>
        {(() => {
          const allVendors = [
            ...(product.vendorName ? [{ vendorId: product.vendorId, vendorName: product.vendorName }] : []),
            ...product.alternateVendors,
          ];
          return allVendors.length > 0 ? (
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
          );
        })()}
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Pricing
        </p>
        <dl>
          <DetailRow label="Unit Cost" value={formatCurrency(product.unitCost)} />
          <DetailRow label="Sale Price" value={formatCurrency(product.price)} />
          <DetailRow label="Margin" value={`${margin}%`} />
        </dl>
      </div>

      {product.description && (
        <>
          <Separator />
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </p>
            <p className="text-sm text-slate-700">{product.description}</p>
          </div>
        </>
      )}

      <Separator />
      <dl>
        <DetailRow label="Added" value={formatDate(product.createdAt)} />
      </dl>
    </div>
  );
}

function HistoryTab({
  product,
  purchaseOrders,
}: {
  product: ProductItem;
  purchaseOrders: ReturnType<typeof usePurchaseOrders>["data"];
}) {
  const pos = (purchaseOrders ?? [])
    .filter((po) => po.lineItems.some((li) => li.productItemId === product.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Price history: one point per PO
  const priceHistory = pos.map((po) => {
    const li = po.lineItems.find((l) => l.productItemId === product.id)!;
    return {
      date: new Date(po.createdAt).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      unitCost: li.unitCost / 100,
      fullDate: po.createdAt,
    };
  });

  return (
    <div className="p-6">
      {pos.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-slate-400">No purchase history found for this product.</p>
        </div>
      ) : (
        <>
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
                  const li = po.lineItems.find((l) => l.productItemId === product.id)!;
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

export function ProductDetailSheet({ product, open, onOpenChange }: ProductDetailSheetProps) {
  const { data: requisitions } = useRequisitions();
  const { data: purchaseOrders } = usePurchaseOrders();
  const [qtyOnHand, setQtyOnHand] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [manageVendorsOpen, setManageVendorsOpen] = useState(false);
  const { mutate: deleteProduct, isPending: deleting } = useDeleteProduct();
  const { mutate: updateProduct } = useUpdateProduct();

  if (!product) return null;

  const effectiveQty = qtyOnHand ?? product.quantityOnHand ?? 0;
  const productId = product.id;

  function handleQtyChange(n: number) {
    setQtyOnHand(n);
    updateProduct({ id: productId, quantityOnHand: n });
  }

  function handleVendorsSave(
    primary: { vendorId: string; vendorName: string } | null,
    alternates: Array<{ vendorId: string; vendorName: string }>,
  ) {
    updateProduct({
      id: productId,
      vendorId: primary?.vendorId ?? "",
      vendorName: primary?.vendorName ?? "",
      alternateVendors: alternates,
    });
  }

  const activeReqStatuses = new Set(["draft", "pending_approval", "approved"]);
  const activePoStatuses = new Set(["requested", "pending", "approved", "partially_fulfilled"]);

  const onOrderQty =
    (requisitions ?? [])
      .filter((r) => activeReqStatuses.has(r.status))
      .flatMap((r) => r.lineItems)
      .filter((li) => li.productItemId === product.id)
      .reduce((sum, li) => sum + li.quantity, 0) +
    (purchaseOrders ?? [])
      .filter((po) => activePoStatuses.has(po.status))
      .flatMap((po) => po.lineItems)
      .filter((li) => li.productItemId === product.id)
      .reduce((sum, li) => sum + li.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]">
        <SheetHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <div className="flex items-start gap-3">
            <ThumbnailUpload
              imageUrl={product.pictureUrl}
              alt={product.name}
              size="md"
              onUpload={(url) => updateProduct({ id: productId, pictureUrl: url })}
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-left">{product.name}</SheetTitle>
                <div className="flex items-center gap-1">
                  <EditButton onClick={() => setEditOpen(true)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge
                  variant={product.category}
                  label={PRODUCT_CATEGORY_LABELS[product.category]}
                />
                {product.isInventory && (
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                    Inventory
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 overflow-x-auto border-b px-4 md:px-6">
            <TabsList className="h-10 bg-transparent p-0">
              {["details", "history", "audit trail"].map((v) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="h-10 whitespace-nowrap rounded-none border-b-2 border-transparent px-2.5 pb-0 pt-0 text-xs font-medium text-slate-500 md:px-4 md:text-sm data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none capitalize"
                >
                  {v}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="details" className="mt-0 flex-1 overflow-y-auto">
            <DetailsTab
              product={product}
              onOrderQty={onOrderQty}
              qtyOnHand={effectiveQty}
              setQtyOnHand={handleQtyChange}
              onManageVendors={() => setManageVendorsOpen(true)}
            />
          </TabsContent>
          <TabsContent value="history" className="mt-0 flex-1 overflow-y-auto">
            <HistoryTab product={product} purchaseOrders={purchaseOrders} />
          </TabsContent>
          <TabsContent value="audit trail" className="mt-0 flex-1 overflow-y-auto">
            <AuditTrailTab recordType="product" recordId={product.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
      <NewProductDialog open={editOpen} onOpenChange={setEditOpen} initialData={product} />
      <ManageVendorsDialog
        open={manageVendorsOpen}
        onOpenChange={setManageVendorsOpen}
        primaryVendor={product.vendorName ? { vendorId: product.vendorId, vendorName: product.vendorName } : null}
        alternateVendors={product.alternateVendors}
        onSave={handleVendorsSave}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{product.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deleting}
              onClick={() =>
                deleteProduct(product.id, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false);
                    onOpenChange(false);
                  },
                })
              }
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
