"use client";

import { useState, useEffect } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { ThumbnailUpload } from "@/components/shared/ThumbnailUpload";
import { EditButton } from "@/components/shared/EditButton";
import { useAssets, useUpdateAsset, useUpdateAssetStatus } from "@/lib/hooks/use-assets";
import { useSettingsStore } from "@/stores/settings-store";
import { AssetPartsTab } from "@/components/shared/AssetPartsTab";
import { WOHistoryTab } from "@/components/shared/WOHistoryTab";
import { AssetMetersTab } from "@/components/shared/AssetMetersTab";
import { NewAssetDialog } from "@/components/cmms/NewAssetDialog";
import type { Asset, AssetStatus } from "@/types";

interface AssetDetailPanelProps {
  asset: Asset;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function DetailsTab({ asset, status }: { asset: Asset; status: AssetStatus }) {
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [saved, setSaved] = useState(false);
  // Local photo URL so the thumbnail shows immediately on upload without waiting
  // for the parent prop to propagate back through the query cache / stale sheet state.
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null | undefined>(asset.photoUrl);
  const { filterFields } = useSettingsStore();
  const enabledFilters = filterFields.filter((f) => f.enabled);
  const { mutate: updateAsset } = useUpdateAsset();

  function saveNotes() {
    updateAsset(
      { id: asset.id, notes },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Thumbnail + identity */}
      <div className="flex items-start gap-4">
        <ThumbnailUpload
          imageUrl={localPhotoUrl}
          alt={asset.name}
          size="lg"
          onUpload={(url) => {
            setLocalPhotoUrl(url);
            updateAsset({ id: asset.id, photoUrl: url });
          }}
        />
        <dl className="flex-1">
        <MetaRow label="Asset Tag" value={<span className="font-mono">{asset.assetTag}</span>} />
        <MetaRow label="Equipment #" value={asset.equipmentNumber} />
        <MetaRow label="Asset Type" value={asset.assetType.replace(/_/g, " ")} />
        <MetaRow
          label="Status"
          value={
            <StatusBadge
              variant={status as Parameters<typeof StatusBadge>[0]["variant"]}
              label={ASSET_STATUS_LABELS[status] ?? status}
            />
          }
        />
        <MetaRow label="Division" value={asset.division} />
        <MetaRow label="Assigned Crew" value={asset.assignedCrew} />
        <MetaRow label="Location" value={asset.location} />
        </dl>
      </div>

      <Separator />

      {/* Specs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Equipment Details
        </p>
        <dl>
          <MetaRow label="Make" value={asset.make} />
          <MetaRow label="Model" value={asset.model} />
          <MetaRow label="Year" value={asset.year} />
          <MetaRow label="Serial Number" value={asset.serialNumber} />
          <MetaRow label="Engine Model" value={asset.engineModel} />
          <MetaRow label="Engine Serial" value={asset.engineSerialNumber} />
        </dl>
      </div>

      <Separator />

      {/* Quick Reference Part #'s — driven by settings */}
      {enabledFilters.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Quick Reference Part #&apos;s
          </p>
          <dl>
            {enabledFilters.map((f) => (
              <MetaRow
                key={f.id}
                label={f.label}
                value={f.fieldKey ? asset[f.fieldKey] : null}
              />
            ))}
          </dl>
        </div>
      )}

      <Separator />

      {/* Purchase info */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Purchase Info
        </p>
        <dl>
          <MetaRow label="Vendor" value={asset.purchaseVendorName} />
          <MetaRow
            label="Purchase Date"
            value={asset.purchaseDate ? formatDate(asset.purchaseDate) : null}
          />
          <MetaRow
            label="Purchase Price"
            value={asset.purchasePrice ? formatCurrency(asset.purchasePrice) : null}
          />
          <MetaRow
            label="Payment Method"
            value={asset.paymentMethod
              ? { outright: "Paid Outright", loan: "Loan", lease: "Lease", rental: "Rental" }[asset.paymentMethod]
              : null}
          />
          <MetaRow label="Finance Institution" value={asset.financeInstitution} />
        </dl>
      </div>

      <Separator />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium text-green-600 transition-opacity duration-300",
              saved ? "opacity-100" : "opacity-0"
            )}
          >
            <Check className="h-3 w-3" /> Saved
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes about this asset…"
          rows={4}
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

function FilesTab({ asset }: { asset: Asset }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="asset" recordId={asset.id} />
    </div>
  );
}

function SubAssetsTab({ asset }: { asset: Asset }) {
  const { data: allAssets } = useAssets();
  const subAssets = (allAssets ?? []).filter((a) => a.parentAssetId === asset.id);

  if (subAssets.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-400">No sub-assets linked to this asset.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-6">
      {subAssets.map((sub) => (
        <div
          key={sub.id}
          className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-slate-900">{sub.name}</p>
            <p className="text-xs text-slate-500">
              {[sub.make, sub.model].filter(Boolean).join(" ")}
              {sub.assetTag && (
                <span className="ml-2 font-mono text-slate-400">{sub.assetTag}</span>
              )}
            </p>
          </div>
          <StatusBadge
            variant={sub.status as Parameters<typeof StatusBadge>[0]["variant"]}
            label={ASSET_STATUS_LABELS[sub.status] ?? sub.status}
          />
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ asset }: { asset: Asset }) {
  return <AuditTrailTab recordType="asset" recordId={asset.id} />;
}

const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];

export function AssetDetailPanel({ asset }: AssetDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [status, setStatus] = useState<AssetStatus>(asset.status as AssetStatus);
  const { mutate: updateAssetStatus } = useUpdateAssetStatus();

  // Sync local status state when the asset prop updates (e.g. status changed
  // from the Work Order detail panel and the cache invalidates).
  useEffect(() => {
    setStatus(asset.status as AssetStatus);
  }, [asset.status]);

  function handleStatusChange(newStatus: AssetStatus) {
    setStatus(newStatus);
    updateAssetStatus({ id: asset.id, status: newStatus });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{asset.name}</h2>
          <p className="text-sm text-slate-500">
            {[asset.make, asset.model, asset.year].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <StatusBadge
                  variant={status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={ASSET_STATUS_LABELS[status] ?? status}
                />
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {ASSET_STATUS_OPTIONS.map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={() => handleStatusChange(value)}
                  className={cn(value === status && "font-medium text-brand-600")}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setDuplicateOpen(true)}
            title="Duplicate asset"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Copy className="h-4 w-4" />
          </button>
          <EditButton onClick={() => setEditOpen(true)} />
        </div>
      </div>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: <DetailsTab asset={asset} status={status} />,
          },
          {
            value: "parts",
            label: "Parts",
            content: <AssetPartsTab assetId={asset.id} recordLabel="asset" />,
          },
          {
            value: "wo-history",
            label: "WO History",
            content: <WOHistoryTab assetId={asset.id} recordLabel="asset" />,
          },
          {
            value: "meters",
            label: "Meters",
            content: <AssetMetersTab assetId={asset.id} recordLabel="asset" />,
          },
          {
            value: "sub-assets",
            label: "Sub-assets",
            content: <SubAssetsTab asset={asset} />,
          },
          {
            value: "files",
            label: "Files",
            content: <FilesTab asset={asset} />,
          },
          {
            value: "history",
            label: "Audit Trail",
            content: <HistoryTab asset={asset} />,
          },
        ]}
      />
      <NewAssetDialog open={editOpen} onOpenChange={setEditOpen} initialData={asset} />
      <NewAssetDialog open={duplicateOpen} onOpenChange={setDuplicateOpen} initialData={asset} mode="duplicate" />
    </div>
  );
}
