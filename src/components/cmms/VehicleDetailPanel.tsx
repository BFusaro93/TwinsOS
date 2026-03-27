"use client";

import { useState } from "react";
import { Check, ChevronDown, Droplets, FileCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { ThumbnailUpload } from "@/components/shared/ThumbnailUpload";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditButton } from "@/components/shared/EditButton";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { AssetPartsTab } from "@/components/shared/AssetPartsTab";
import { WOHistoryTab } from "@/components/shared/WOHistoryTab";
import { AssetMetersTab } from "@/components/shared/AssetMetersTab";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateVehicle, useUpdateVehicleStatus } from "@/lib/hooks/use-vehicles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewVehicleDialog } from "@/components/cmms/NewVehicleDialog";
import type { Vehicle, AssetStatus } from "@/types";

interface VehicleDetailPanelProps {
  vehicle: Vehicle;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

// ── Service Reminder Card ─────────────────────────────────────────────────────

type ReminderStatus = "overdue" | "due-soon" | "ok" | "unset";

function getReminderStatus(dateStr: string | null): ReminderStatus {
  if (!dateStr) return "unset";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "due-soon";
  return "ok";
}

function daysUntil(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? "s" : ""} overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

interface ServiceReminderCardProps {
  icon: React.ReactNode;
  label: string;
  dateStr: string | null;
  /** When provided (even if null), the card shows a mileage row and mileage reset input */
  mileage?: number | null;
  onReset: (newDate: string | null, newMileage: number | null) => void;
}

function ServiceReminderCard({ icon, label, dateStr, mileage, onReset }: ServiceReminderCardProps) {
  const [resetting, setResetting] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newMileage, setNewMileage] = useState("");
  const hasMileage = mileage !== undefined; // tracks whether this card supports mileage at all
  const status = getReminderStatus(dateStr);

  const colors: Record<ReminderStatus, string> = {
    overdue:    "border-red-200 bg-red-50",
    "due-soon": "border-amber-200 bg-amber-50",
    ok:         "border-green-200 bg-green-50",
    unset:      "border-slate-200 bg-slate-50",
  };
  const dotColors: Record<ReminderStatus, string> = {
    overdue:    "bg-red-500",
    "due-soon": "bg-amber-400",
    ok:         "bg-green-500",
    unset:      "bg-slate-300",
  };
  const textColors: Record<ReminderStatus, string> = {
    overdue:    "text-red-700",
    "due-soon": "text-amber-700",
    ok:         "text-green-700",
    unset:      "text-slate-500",
  };

  const hasAnyValue = !!dateStr || (hasMileage && mileage != null);

  function handleConfirmReset() {
    if (!newDate && !newMileage) return;
    onReset(
      newDate || null,
      newMileage ? parseInt(newMileage, 10) : null,
    );
    setResetting(false);
    setNewDate("");
    setNewMileage("");
  }

  function handleCancel() {
    setResetting(false);
    setNewDate("");
    setNewMileage("");
  }

  return (
    <div className={cn("rounded-lg border p-3.5", colors[status])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-slate-500">{icon}</div>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-slate-800">{label}</p>

            {!hasAnyValue && (
              <p className="text-xs text-slate-400">Not tracked</p>
            )}

            {dateStr && (
              <div className="flex items-center gap-2">
                <span className="w-14 text-xs text-slate-400">By date:</span>
                <span className={cn("text-xs font-medium", textColors[status])}>
                  <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", dotColors[status])} />
                  {formatDate(dateStr)}
                  <span className="ml-1 text-slate-400">({daysUntil(dateStr)})</span>
                </span>
              </div>
            )}

            {hasMileage && mileage != null && (
              <div className="flex items-center gap-2">
                <span className="w-14 text-xs text-slate-400">By mileage:</span>
                <span className="text-xs font-medium text-slate-700">
                  {mileage.toLocaleString()} mi
                </span>
              </div>
            )}

            {hasMileage && (dateStr || mileage != null) && (
              <p className="mt-0.5 text-[10px] text-slate-400 italic">
                Whichever comes first
              </p>
            )}
          </div>
        </div>

        {!resetting && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => setResetting(true)}
          >
            <RotateCcw className="h-3 w-3" />
            {hasAnyValue ? "Mark Done" : "Set"}
          </Button>
        )}
      </div>

      {/* Inline reset form */}
      {resetting && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-600">
            Set next {label.toLowerCase()} due
          </p>
          <div className={cn("grid gap-3", hasMileage ? "grid-cols-2" : "grid-cols-1")}>
            <div className="grid gap-1">
              <label className="text-xs text-slate-500">Date</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {hasMileage && (
              <div className="grid gap-1">
                <label className="text-xs text-slate-500">Mileage</label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    value={newMileage}
                    onChange={(e) => setNewMileage(e.target.value)}
                    placeholder="e.g. 90000"
                    className="h-8 pr-7 text-sm"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    mi
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" disabled={!newDate && !newMileage} onClick={handleConfirmReset}>
              <Check className="mr-1 h-3 w-3" />
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsTab({ vehicle, status }: { vehicle: Vehicle; status: AssetStatus }) {
  const [notes, setNotes] = useState(vehicle.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [oilChangeDue, setOilChangeDue] = useState(vehicle.nextOilChangeDue);
  const [oilChangeMileage, setOilChangeMileage] = useState(vehicle.nextOilChangeMileage);
  const [inspectionDue, setInspectionDue] = useState(vehicle.nextInspectionStickerDue);
  // Local photo URL so the thumbnail shows immediately on upload without waiting
  // for the parent prop to propagate back through the query cache / stale sheet state.
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null | undefined>(vehicle.photoUrl);
  const { filterFields } = useSettingsStore();
  const enabledFilters = filterFields.filter((f) => f.enabled);
  const { mutate: updateVehicle } = useUpdateVehicle();

  function saveNotes() {
    updateVehicle(
      { id: vehicle.id, notes },
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
      {/* Service Reminders */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Service Reminders
        </p>
        <div className="flex flex-col gap-2">
          <ServiceReminderCard
            icon={<Droplets className="h-4 w-4" />}
            label="Oil Change"
            dateStr={oilChangeDue}
            mileage={oilChangeMileage}
            onReset={(newDate, newMileage) => {
              setOilChangeDue(newDate);
              setOilChangeMileage(newMileage);
              updateVehicle({
                id: vehicle.id,
                nextOilChangeDue: newDate,
                nextOilChangeMileage: newMileage,
              });
            }}
          />
          <ServiceReminderCard
            icon={<FileCheck className="h-4 w-4" />}
            label="Inspection Sticker"
            dateStr={inspectionDue}
            onReset={(newDate) => {
              setInspectionDue(newDate);
              updateVehicle({ id: vehicle.id, nextInspectionStickerDue: newDate });
            }}
          />
        </div>
      </div>

      <Separator />

      {/* Thumbnail */}
      <div className="flex items-start gap-4">
        <ThumbnailUpload
          imageUrl={localPhotoUrl}
          alt={vehicle.name}
          size="lg"
          onUpload={(url) => {
            setLocalPhotoUrl(url);
            updateVehicle({ id: vehicle.id, photoUrl: url });
          }}
        />
        <dl className="flex-1">
          <MetaRow label="Asset Tag" value={<span className="font-mono">{vehicle.assetTag}</span>} />
          <MetaRow label="Equipment #" value={vehicle.equipmentNumber} />
          <MetaRow
            label="Status"
            value={
              <StatusBadge
                variant={status as Parameters<typeof StatusBadge>[0]["variant"]}
                label={ASSET_STATUS_LABELS[status] ?? status}
              />
            }
          />
          <MetaRow label="Division" value={vehicle.division} />
          <MetaRow label="Assigned Crew" value={vehicle.assignedCrew} />
          <MetaRow label="Location" value={vehicle.location} />
        </dl>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Vehicle Details
        </p>
        <dl>
          <MetaRow label="Make" value={vehicle.make} />
          <MetaRow label="Model" value={vehicle.model} />
          <MetaRow label="Year" value={vehicle.year} />
          <MetaRow label="Engine" value={vehicle.engineModel} />
          <MetaRow label="Fuel Type" value={vehicle.fuelType} />
          <MetaRow label="License Plate" value={vehicle.licensePlate} />
          <MetaRow label="VIN" value={vehicle.vin ? <span className="font-mono text-xs">{vehicle.vin}</span> : null} />
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
                value={f.fieldKey ? vehicle[f.fieldKey] : null}
              />
            ))}
          </dl>
        </div>
      )}

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Purchase Info
        </p>
        <dl>
          <MetaRow label="Vendor" value={vehicle.purchaseVendorName} />
          <MetaRow
            label="Purchase Date"
            value={vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : null}
          />
          <MetaRow
            label="Purchase Price"
            value={vehicle.purchasePrice ? formatCurrency(vehicle.purchasePrice) : null}
          />
          <MetaRow
            label="Payment Method"
            value={vehicle.paymentMethod
              ? { outright: "Paid Outright", loan: "Loan", lease: "Lease", rental: "Rental" }[vehicle.paymentMethod]
              : null}
          />
          <MetaRow label="Finance Institution" value={vehicle.financeInstitution} />
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
          placeholder="Add notes about this vehicle…"
          rows={4}
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

function HistoryTab({ vehicle }: { vehicle: Vehicle }) {
  return <AuditTrailTab recordType="vehicle" recordId={vehicle.id} />;
}

function FilesTab({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="vehicle" recordId={vehicle.id} />
    </div>
  );
}

const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];

export function VehicleDetailPanel({ vehicle }: VehicleDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [status, setStatus] = useState<AssetStatus>(vehicle.status as AssetStatus);
  const { mutate: updateVehicleStatus } = useUpdateVehicleStatus();

  function handleStatusChange(newStatus: AssetStatus) {
    setStatus(newStatus);
    updateVehicleStatus({ id: vehicle.id, status: newStatus });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{vehicle.name}</h2>
          <p className="text-sm text-slate-500">
            {vehicle.licensePlate ?? vehicle.vin ?? vehicle.assetTag}
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
          <EditButton onClick={() => setEditOpen(true)} />
        </div>
      </div>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: <DetailsTab vehicle={vehicle} status={status} />,
          },
          {
            value: "parts",
            label: "Parts",
            content: <AssetPartsTab assetId={vehicle.id} recordLabel="vehicle" />,
          },
          {
            value: "wo-history",
            label: "WO History",
            content: <WOHistoryTab assetId={vehicle.id} recordLabel="vehicle" />,
          },
          {
            value: "meters",
            label: "Meters",
            content: <AssetMetersTab assetId={vehicle.id} recordLabel="vehicle" />,
          },
          {
            value: "files",
            label: "Files",
            content: <FilesTab vehicle={vehicle} />,
          },
          {
            value: "history",
            label: "Audit Trail",
            content: <HistoryTab vehicle={vehicle} />,
          },
        ]}
      />
      <NewVehicleDialog open={editOpen} onOpenChange={setEditOpen} initialData={vehicle} />
    </div>
  );
}
