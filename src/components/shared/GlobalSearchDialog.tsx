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
  FolderKanban,
  Camera,
  Users,
  UserPlus,
  Receipt,
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
import { useProjects } from "@/lib/hooks/use-projects";
import { usePhotoJobs } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { useClients, useLeads } from "@/lib/hooks/use-clients";
import { useInvoices } from "@/lib/hooks/use-invoices";
import { usePOStore, useCMMSStore, useCurrentUserStore } from "@/stores";
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
  const { currentUser } = useCurrentUserStore();

  const isCrew = currentUser.role === "crew";
  const hasPhotoAccess = isCrew || currentUser.role === "admin" || currentUser.photoModuleAccess;
  // Crew only sees Photo Jobs — all other groups are hidden from them
  const showFullSearch = !isCrew;

  const { data: workOrders = [] } = useWorkOrders();
  const { data: assets = [] } = useAssets();
  const { data: vehicles = [] } = useVehicles();
  const { data: requisitions = [] } = useRequisitions();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: parts = [] } = useParts();
  const { data: allProducts = [] } = useProducts();
  const { data: vendors = [] } = useVendors();
  const { data: projects = [] } = useProjects();
  const { data: photoJobs = [] } = usePhotoJobs();
  const { data: clients = [] } = useClients();
  const { data: leads = [] } = useLeads();
  const { data: invoices = [] } = useInvoices();

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
      <CommandInput placeholder="Search clients, leads, invoices, work orders, assets…" />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>No results found.</CommandEmpty>

        {showFullSearch && workOrders.length > 0 && (
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

        {showFullSearch && (workOrders.length > 0 && assets.length > 0) && <CommandSeparator />}

        {showFullSearch && assets.length > 0 && (
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

        {showFullSearch && (assets.length > 0 && vehicles.length > 0) && <CommandSeparator />}

        {showFullSearch && vehicles.length > 0 && (
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

        {showFullSearch && (vehicles.length > 0 && parts.length > 0) && <CommandSeparator />}

        {showFullSearch && parts.length > 0 && (
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

        {showFullSearch && (parts.length > 0 && catalogProducts.length > 0) && <CommandSeparator />}

        {showFullSearch && catalogProducts.length > 0 && (
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

        {showFullSearch && (catalogProducts.length > 0 && requisitions.length > 0) && <CommandSeparator />}

        {showFullSearch && requisitions.length > 0 && (
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

        {showFullSearch && (requisitions.length > 0 && purchaseOrders.length > 0) && <CommandSeparator />}

        {showFullSearch && purchaseOrders.length > 0 && (
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

        {showFullSearch && (purchaseOrders.length > 0 && vendors.length > 0) && <CommandSeparator />}

        {showFullSearch && vendors.length > 0 && (
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

        {showFullSearch && (vendors.length > 0 && projects.length > 0) && <CommandSeparator />}

        {showFullSearch && projects.length > 0 && (
          <CommandGroup heading="Projects">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`${project.name} ${project.customerName ?? ""} ${project.address ?? ""} ${project.city ?? ""} ${project.state ?? ""} project job`}
                onSelect={() => go("/po/projects")}
                className="flex items-center gap-3"
              >
                <FolderKanban className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  {project.customerName && (
                    <span className="truncate text-xs text-slate-400">{project.customerName}</span>
                  )}
                </div>
                <StatusBadge
                  variant={project.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={project.status}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showFullSearch && clients.length > 0 && <CommandSeparator />}

        {showFullSearch && clients.length > 0 && (
          <CommandGroup heading="Clients">
            {clients.map((client) => (
              <CommandItem
                key={client.id}
                value={`${client.displayName} ${client.primaryPhone ?? ""} ${client.primaryEmail ?? ""} ${client.billingCity ?? ""} client`}
                onSelect={() => go(`/crm/clients/${client.id}`)}
                className="flex items-center gap-3"
              >
                <Users className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{client.displayName}</span>
                  <span className="truncate text-xs text-slate-400">
                    {[client.billingCity, client.billingState].filter(Boolean).join(", ") || client.primaryPhone || client.primaryEmail || ""}
                  </span>
                </div>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${client.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {client.status}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showFullSearch && leads.length > 0 && <CommandSeparator />}

        {showFullSearch && leads.length > 0 && (
          <CommandGroup heading="Leads">
            {leads.map((lead) => (
              <CommandItem
                key={lead.id}
                value={`${lead.displayName} ${lead.primaryPhone ?? ""} ${lead.primaryEmail ?? ""} ${lead.billingCity ?? ""} lead`}
                onSelect={() => go(`/crm/clients/${lead.id}`)}
                className="flex items-center gap-3"
              >
                <UserPlus className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{lead.displayName}</span>
                  <span className="truncate text-xs text-slate-400">
                    {lead.source ? `via ${lead.source}` : ""}{lead.billingCity ? ` · ${lead.billingCity}` : ""}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                  Lead
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showFullSearch && invoices.length > 0 && <CommandSeparator />}

        {showFullSearch && invoices.length > 0 && (
          <CommandGroup heading="Invoices">
            {invoices.map((inv) => (
              <CommandItem
                key={inv.id}
                value={`${inv.invoiceNumber} ${inv.clientName ?? ""} invoice`}
                onSelect={() => go(`/crm/accounting/invoices/${inv.id}`)}
                className="flex items-center gap-3"
              >
                <Receipt className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{inv.invoiceNumber}</span>
                  {inv.clientName && (
                    <span className="truncate text-xs text-slate-400">{inv.clientName}</span>
                  )}
                </div>
                <StatusBadge variant={inv.status as Parameters<typeof StatusBadge>[0]["variant"]} label={inv.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasPhotoAccess && (showFullSearch ? projects.length > 0 : false) && photoJobs.length > 0 && <CommandSeparator />}

        {hasPhotoAccess && photoJobs.length > 0 && (
          <CommandGroup heading="Photo Jobs">
            {photoJobs.map((job) => (
              <CommandItem
                key={job.id}
                value={`${job.name} ${job.customerName ?? ""} ${job.address ?? ""} photo job`}
                onSelect={() => go(`/photos/jobs/${job.id}`)}
                className="flex items-center gap-3"
              >
                <Camera className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{job.name}</span>
                  {job.customerName && (
                    <span className="truncate text-xs text-slate-400">{job.customerName}</span>
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
