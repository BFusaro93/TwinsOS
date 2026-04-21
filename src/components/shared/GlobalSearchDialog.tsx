"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  Package,
  Truck,
  ShoppingCart,
  FileText,
  Box,
  Building2,
  Leaf,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useAssets } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useParts } from "@/lib/hooks/use-parts";
import { useProducts } from "@/lib/hooks/use-products";
import { useVendors } from "@/lib/hooks/use-vendors";
import { usePOStore, useCMMSStore } from "@/stores";
import {
  WO_STATUS_LABELS,
  PO_STATUS_LABELS,
  ASSET_STATUS_LABELS,
} from "@/lib/constants";

const REQ_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  closed: "Closed",
};

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const router = useRouter();
  const { setSelectedRequisitionId, setSelectedPOId } = usePOStore();
  const {
    setSelectedWorkOrderId,
    setSelectedAssetId,
    setSelectedVehicleId,
    setSelectedPMScheduleId,
  } = useCMMSStore();

  const { data: workOrders = [] } = useWorkOrders();
  const { data: assets = [] } = useAssets();
  const { data: vehicles = [] } = useVehicles();
  const { data: requisitions = [] } = useRequisitions();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: parts = [] } = useParts();
  const { data: allProducts = [] } = useProducts();
  const { data: vendors = [] } = useVendors();

  // Only surface stocked and project materials in search (maintenance_parts are already in Parts)
  const catalogProducts = allProducts.filter(
    (p) => p.category === "stocked_material" || p.category === "project_material"
  );

  // Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  function go(href: string, select?: () => void) {
    select?.();
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search work orders, assets, parts, requisitions…" />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>No results found.</CommandEmpty>

        {workOrders.length > 0 && (
          <CommandGroup heading="Work Orders">
            {workOrders.map((wo) => (
              <CommandItem
                key={wo.id}
                value={`${wo.workOrderNumber} ${wo.title} ${wo.assetName ?? ""} work order`}
                onSelect={() => go("/cmms/work-orders", () => setSelectedWorkOrderId(wo.id))}
                className="flex items-center gap-3"
              >
                <Wrench className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {wo.workOrderNumber} — {wo.title}
                  </span>
                  {wo.assetName && (
                    <span className="truncate text-xs text-slate-400">{wo.assetName}</span>
                  )}
                </div>
                <StatusBadge variant={wo.status} label={WO_STATUS_LABELS[wo.status]} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(workOrders.length > 0 && assets.length > 0) && <CommandSeparator />}

        {assets.length > 0 && (
          <CommandGroup heading="Assets">
            {assets.map((asset) => (
              <CommandItem
                key={asset.id}
                value={`${asset.name} ${asset.assetTag ?? ""} ${asset.equipmentNumber ?? ""} ${asset.make ?? ""} ${asset.model ?? ""} asset`}
                onSelect={() => go("/cmms/assets", () => setSelectedAssetId(asset.id))}
                className="flex items-center gap-3"
              >
                <Package className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{asset.name}</span>
                  <span className="truncate text-xs text-slate-400">
                    {[asset.make, asset.model, asset.year].filter(Boolean).join(" ")}
                    {asset.assetTag && ` · ${asset.assetTag}`}
                  </span>
                </div>
                <StatusBadge
                  variant={asset.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(assets.length > 0 && vehicles.length > 0) && <CommandSeparator />}

        {vehicles.length > 0 && (
          <CommandGroup heading="Vehicles">
            {vehicles.map((vehicle) => (
              <CommandItem
                key={vehicle.id}
                value={`${vehicle.name} ${vehicle.licensePlate ?? ""} ${vehicle.vin ?? ""} ${vehicle.assetTag ?? ""} ${vehicle.equipmentNumber ?? ""} ${vehicle.make ?? ""} vehicle`}
                onSelect={() => go("/cmms/vehicles", () => setSelectedVehicleId(vehicle.id))}
                className="flex items-center gap-3"
              >
                <Truck className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{vehicle.name}</span>
                  <span className="truncate text-xs text-slate-400">
                    {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")}
                    {vehicle.licensePlate && ` · ${vehicle.licensePlate}`}
                  </span>
                </div>
                <StatusBadge
                  variant={vehicle.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={ASSET_STATUS_LABELS[vehicle.status] ?? vehicle.status}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(vehicles.length > 0 && parts.length > 0) && <CommandSeparator />}

        {parts.length > 0 && (
          <CommandGroup heading="Parts">
            {parts.map((part) => (
              <CommandItem
                key={part.id}
                value={`${part.name} ${part.partNumber ?? ""} part inventory`}
                onSelect={() => go(`/cmms/parts?open=${part.id}`)}
                className="flex items-center gap-3"
              >
                <Box className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{part.name}</span>
                  {part.partNumber && (
                    <span className="font-mono text-xs text-slate-400">{part.partNumber}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {part.quantityOnHand} in stock
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(parts.length > 0 && catalogProducts.length > 0) && <CommandSeparator />}

        {catalogProducts.length > 0 && (
          <CommandGroup heading="Products">
            {catalogProducts.map((product) => (
              <CommandItem
                key={product.id}
                value={`${product.name} ${product.partNumber ?? ""} ${product.category === "stocked_material" ? "stocked material" : "project material"} product`}
                onSelect={() => go("/po/products")}
                className="flex items-center gap-3"
              >
                <Leaf className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{product.name}</span>
                  <span className="truncate text-xs text-slate-400">
                    {product.category === "stocked_material" ? "Stocked Material" : "Project Material"}
                    {product.vendorName ? ` · ${product.vendorName}` : ""}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(catalogProducts.length > 0 && requisitions.length > 0) && <CommandSeparator />}

        {requisitions.length > 0 && (
          <CommandGroup heading="Requisitions">
            {requisitions.map((req) => (
              <CommandItem
                key={req.id}
                value={`${req.requisitionNumber} ${req.title ?? ""} requisition`}
                onSelect={() => go("/po/requisitions", () => setSelectedRequisitionId(req.id))}
                className="flex items-center gap-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {req.requisitionNumber}{req.title ? ` — ${req.title}` : ""}
                  </span>
                  {req.vendorName && (
                    <span className="truncate text-xs text-slate-400">{req.vendorName}</span>
                  )}
                </div>
                <StatusBadge
                  variant={req.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={REQ_STATUS_LABELS[req.status] ?? req.status}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(requisitions.length > 0 && purchaseOrders.length > 0) && <CommandSeparator />}

        {purchaseOrders.length > 0 && (
          <CommandGroup heading="Purchase Orders">
            {purchaseOrders.map((po) => (
              <CommandItem
                key={po.id}
                value={`${po.poNumber} ${po.vendorName ?? ""} purchase order`}
                onSelect={() => go("/po/orders", () => setSelectedPOId(po.id))}
                className="flex items-center gap-3"
              >
                <ShoppingCart className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{po.poNumber}</span>
                  {po.vendorName && (
                    <span className="truncate text-xs text-slate-400">{po.vendorName}</span>
                  )}
                </div>
                <StatusBadge
                  variant={po.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={PO_STATUS_LABELS[po.status] ?? po.status}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(purchaseOrders.length > 0 && vendors.length > 0) && <CommandSeparator />}

        {vendors.length > 0 && (
          <CommandGroup heading="Vendors">
            {vendors.map((vendor) => (
              <CommandItem
                key={vendor.id}
                value={`${vendor.name} ${vendor.contactName ?? ""} vendor`}
                onSelect={() => go("/po/vendors")}
                className="flex items-center gap-3"
              >
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{vendor.name}</span>
                  {vendor.contactName && (
                    <span className="truncate text-xs text-slate-400">{vendor.contactName}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
