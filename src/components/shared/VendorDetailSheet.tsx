"use client";

import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { EditButton } from "@/components/shared/EditButton";
import { NewVendorDialog } from "./NewVendorDialog";
import { getInitials, getAvatarColor, formatDate, formatCurrency } from "@/lib/utils";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useParts, useUpdatePart } from "@/lib/hooks/use-parts";
import { useProducts } from "@/lib/hooks/use-products";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PartDetailSheet } from "@/components/cmms/PartDetailSheet";
import { ProductDetailSheet } from "@/components/po/ProductDetailSheet";
import { PODetailPanel } from "@/components/po/PODetailPanel";
import type { Vendor, W9Status, Part, ProductItem, PurchaseOrder } from "@/types";

interface VendorDetailSheetProps {
  vendor: Vendor | null;
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

const W9_STATUS_CONFIG: Record<W9Status, { label: string; classes: string }> = {
  not_requested: {
    label: "Not Requested",
    classes: "border-slate-200 bg-slate-100 text-slate-500",
  },
  requested: {
    label: "Requested",
    classes: "border-yellow-200 bg-yellow-50 text-yellow-700",
  },
  received: {
    label: "Received",
    classes: "border-green-200 bg-green-100 text-green-700",
  },
  expired: {
    label: "Expired",
    classes: "border-red-200 bg-red-100 text-red-700",
  },
};

function DetailsTab({ vendor }: { vendor: Vendor }) {
  const w9Config = W9_STATUS_CONFIG[vendor.w9Status];

  return (
    <div className="p-6 pb-10">
      <dl>
        <DetailRow label="Contact" value={vendor.contactName} />
        <DetailRow
          label="Email"
          value={
            <a href={`mailto:${vendor.email}`} className="text-brand-600 hover:underline">
              {vendor.email}
            </a>
          }
        />
        <DetailRow label="Phone" value={vendor.phone} />
        <DetailRow label="Address" value={vendor.address} />
        <DetailRow
          label="Website"
          value={
            vendor.website ? (
              <a
                href={vendor.website}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:underline"
              >
                {vendor.website}
              </a>
            ) : null
          }
        />
      </dl>

      {vendor.notes && (
        <>
          <Separator className="my-4" />
          <div className="pb-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </p>
            <p className="text-sm text-slate-700">{vendor.notes}</p>
          </div>
        </>
      )}

      {/* W9 */}
      <Separator className="my-4" />
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          W9 Status
        </p>
        <div className="flex items-start justify-between">
          <Badge variant="outline" className={w9Config.classes}>
            {w9Config.label}
          </Badge>
        </div>
        {(vendor.w9ReceivedDate || vendor.w9ExpirationDate) && (
          <dl className="mt-3">
            {vendor.w9ReceivedDate && (
              <DetailRow
                label="Received"
                value={formatDate(vendor.w9ReceivedDate)}
              />
            )}
            {vendor.w9ExpirationDate && (
              <DetailRow
                label="Expires"
                value={
                  <span className={vendor.w9Status === "expired" ? "text-red-600" : undefined}>
                    {formatDate(vendor.w9ExpirationDate)}
                  </span>
                }
              />
            )}
          </dl>
        )}
      </div>

      {/* Files */}
      <Separator className="my-4" />
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Files
        </p>
        <AttachmentsSection recordType="vendor" recordId={vendor.id} />
      </div>
    </div>
  );
}

function PartsProductsTab({ vendor }: { vendor: Vendor }) {
  const { data: allParts, isLoading: partsLoading } = useParts();
  const { data: allProducts, isLoading: productsLoading } = useProducts();
  const { mutate: updatePart } = useUpdatePart();

  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [partSheetOpen, setPartSheetOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const linkedParts = (allParts ?? []).filter(
    (p) =>
      p.deletedAt === null &&
      (p.vendorId === vendor.id ||
        p.alternateVendors.some((av) => av.vendorId === vendor.id))
  );

  const linkedPartIds = new Set(linkedParts.map((p) => p.id));

  // Parts not yet linked to this vendor
  const availableParts = (allParts ?? []).filter(
    (p) => p.deletedAt === null && !linkedPartIds.has(p.id)
  );
  const filteredAvailable = availableParts.filter(
    (p) =>
      !linkSearch ||
      p.name.toLowerCase().includes(linkSearch.toLowerCase()) ||
      p.partNumber.toLowerCase().includes(linkSearch.toLowerCase())
  );

  const products = (allProducts ?? []).filter(
    (p) =>
      p.deletedAt === null &&
      (p.vendorId === vendor.id ||
        p.alternateVendors.some((av) => av.vendorId === vendor.id))
  );

  const isLoading = partsLoading || productsLoading;

  function handleLinkPart(part: Part) {
    // If no primary vendor yet, set as primary; otherwise add as alternate
    if (!part.vendorId) {
      updatePart({ id: part.id, vendorId: vendor.id, vendorName: vendor.name });
    } else {
      const already = part.alternateVendors.some((av) => av.vendorId === vendor.id);
      if (!already) {
        updatePart({
          id: part.id,
          alternateVendors: [...part.alternateVendors, { vendorId: vendor.id, vendorName: vendor.name }],
        });
      }
    }
    setLinkDialogOpen(false);
    setLinkSearch("");
  }

  function handleUnlinkPart(part: Part) {
    if (part.vendorId === vendor.id) {
      // Remove primary vendor; promote first alternate if available
      const firstAlt = part.alternateVendors[0] ?? null;
      const remaining = part.alternateVendors.slice(1);
      updatePart({
        id: part.id,
        vendorId: firstAlt?.vendorId ?? null,
        vendorName: firstAlt?.vendorName ?? null,
        alternateVendors: remaining,
      });
    } else {
      // Remove from alternates
      updatePart({
        id: part.id,
        alternateVendors: part.alternateVendors.filter((av) => av.vendorId !== vendor.id),
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        {/* Parts */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Parts
              <span className="ml-1.5 font-normal normal-case text-slate-300">({linkedParts.length})</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => { setPartSheetOpen(false); setSelectedPart(null); setLinkDialogOpen(true); }}
            >
              <Plus className="h-3 w-3" />
              Add Part
            </Button>
          </div>

          {linkedParts.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
              <p className="text-sm text-slate-400">No parts linked to this vendor.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Part #</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Category</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">On Hand</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Cost</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {linkedParts.map((part) => {
                    const isPrimary = part.vendorId === vendor.id;
                    return (
                      <tr key={part.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => { setSelectedPart(part); setPartSheetOpen(true); }}
                            className="flex items-center gap-1.5 text-left font-medium text-brand-600 hover:underline"
                          >
                            {part.name}
                            {!isPrimary && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-400">
                                Alt
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{part.partNumber}</td>
                        <td className="px-3 py-2 capitalize text-slate-500">
                          {part.category.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">{part.quantityOnHand}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          {formatCurrency(part.unitCost)}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Unlink part from vendor"
                            onClick={() => handleUnlinkPart(part)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Products */}
        {products.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Products
              <span className="ml-1.5 font-normal normal-case text-slate-300">({products.length})</span>
            </p>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Part #</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Category</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod) => {
                    const isAlt = prod.vendorId !== vendor.id;
                    return (
                      <tr key={prod.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => { setSelectedProduct(prod); setProductSheetOpen(true); }}
                            className="flex items-center gap-1.5 text-left font-medium text-brand-600 hover:underline"
                          >
                            {prod.name}
                            {isAlt && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-400">
                                Alt
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{prod.partNumber}</td>
                        <td className="px-3 py-2 capitalize text-slate-500">
                          {prod.category.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          {formatCurrency(prod.unitCost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Link Part dialog ── */}
      <Dialog open={linkDialogOpen} onOpenChange={(o) => { setLinkDialogOpen(o); if (!o) setLinkSearch(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Part</DialogTitle>
            <DialogDescription>
              Link a part from inventory to this vendor. Parts can be linked to multiple vendors.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name or part #…"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filteredAvailable.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {linkSearch ? "No parts match your search." : "All parts are already linked to this vendor."}
              </p>
            ) : (
              <ul className="divide-y">
                {filteredAvailable.map((part) => (
                  <li key={part.id}>
                    <button
                      className="flex w-full items-start gap-3 rounded px-1 py-2.5 text-left hover:bg-slate-50"
                      onClick={() => handleLinkPart(part)}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{part.name}</p>
                        <p className="text-xs text-slate-500">
                          {part.partNumber} &middot; {part.category.replace(/_/g, " ")}
                          {part.vendorName && (
                            <span className="ml-1 text-slate-400">
                              · Primary: {part.vendorName}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {part.isInventory ? `${part.quantityOnHand} on hand` : "Not tracked"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PartDetailSheet
        part={selectedPart}
        open={partSheetOpen}
        onOpenChange={setPartSheetOpen}
      />
      <ProductDetailSheet
        product={selectedProduct}
        open={productSheetOpen}
        onOpenChange={setProductSheetOpen}
      />
    </>
  );
}

function POHistoryTab({ vendor }: { vendor: Vendor }) {
  const { data: purchaseOrders, isLoading } = usePurchaseOrders();
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  const vendorPOs = (purchaseOrders ?? [])
    .filter((po) => po.vendorId === vendor.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalSpend = vendorPOs.reduce((sum, po) => sum + po.grandTotal, 0);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (vendorPOs.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center p-6">
        <p className="text-sm text-slate-400">No purchase orders found for this vendor.</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        {/* Summary */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-md border bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Orders</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{vendorPOs.length}</p>
          </div>
          <div className="rounded-md border bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Spend</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(totalSpend)}</p>
          </div>
        </div>

        {/* PO list */}
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">PO #</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {vendorPOs.map((po) => (
                <tr key={po.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setSelectedPO(po)}
                      className="font-mono text-xs font-medium text-brand-600 hover:underline"
                    >
                      {po.poNumber}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(po.createdAt)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge variant={po.status} label={po.status.replace(/_/g, " ")} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {formatCurrency(po.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PO detail overlay */}
      <Sheet open={!!selectedPO} onOpenChange={(open) => { if (!open) setSelectedPO(null); }}>
        <SheetContent className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]">
          {selectedPO && <PODetailPanel po={selectedPO} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

export function VendorDetailSheet({ vendor, open, onOpenChange }: VendorDetailSheetProps) {
  const [editOpen, setEditOpen] = useState(false);

  if (!vendor) return null;

  const initials = getInitials(vendor.name);
  const avatarColor = getAvatarColor(vendor.name);

  const TABS = [
    { value: "details", label: "Details" },
    { value: "parts-products", label: "Parts & Products" },
    { value: "po-history", label: "PO History" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-[580px] flex-col overflow-hidden p-0 sm:max-w-[580px]"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor}`}
            >
              {initials}
            </div>
            <div className="flex-1">
              <SheetTitle className="text-left">{vendor.name}</SheetTitle>
              <Badge
                variant="outline"
                className={
                  vendor.isActive
                    ? "border-green-200 bg-green-100 text-green-700"
                    : "border-slate-200 bg-slate-100 text-slate-500"
                }
              >
                {vendor.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <EditButton onClick={() => setEditOpen(true)} />
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b px-6">
            <TabsList className="h-10 bg-transparent p-0">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-10 rounded-none border-b-2 border-transparent px-4 pb-0 pt-0 text-sm font-medium text-slate-500 data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="details" className="mt-0 flex-1 overflow-y-auto">
            <DetailsTab vendor={vendor} />
          </TabsContent>
          <TabsContent value="parts-products" className="mt-0 flex-1 overflow-y-auto">
            <PartsProductsTab vendor={vendor} />
          </TabsContent>
          <TabsContent value="po-history" className="mt-0 flex-1 overflow-y-auto">
            <POHistoryTab vendor={vendor} />
          </TabsContent>
        </Tabs>
      </SheetContent>
      <NewVendorDialog open={editOpen} onOpenChange={setEditOpen} initialData={vendor} />
    </Sheet>
  );
}
