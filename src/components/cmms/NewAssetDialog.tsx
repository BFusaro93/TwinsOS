"use client";

import { useState, useEffect } from "react";
import type { Asset } from "@/types";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { useVendors } from "@/lib/hooks/use-vendors";
import { useAssets, useCreateAsset, useUpdateAsset } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { useSettingsStore } from "@/stores/settings-store";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { WarrantyFields } from "@/components/cmms/WarrantyFields";
import {
  EMPTY_WARRANTY_FORM,
  resolveWarrantyForm,
  warrantyFormFromRecord,
  type WarrantyFormValue,
} from "@/lib/utils/warranty";

interface NewAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Asset | null;
  /** When "duplicate", pre-fills from initialData but always creates a new asset. */
  mode?: "edit" | "duplicate";
  /** Pre-select a parent asset when creating a new sub-asset from a parent's detail panel. */
  presetParentId?: string;
  /** Same, but the parent is a vehicle (plow/salter attached to a truck). */
  presetParentVehicleId?: string;
}

export function NewAssetDialog({ open, onOpenChange, initialData, mode = "edit", presetParentId, presetParentVehicleId }: NewAssetDialogProps) {
  const isSubAsset = !!(presetParentId || presetParentVehicleId);
  const isDuplicate = mode === "duplicate";
  const isEditing = !!initialData && !isDuplicate;
  const { data: vendors } = useVendors();
  const { data: allAssets } = useAssets();
  const { data: allVehicles } = useVehicles();
  const { assetTypes, locations } = useSettingsStore();
  const enabledAssetTypes = assetTypes.filter((t) => t.enabled);
  const enabledLocations = locations.filter((l) => l.enabled);
  const rf = useRequiredFields("asset");

  // Basic Info
  const [name, setName] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [equipmentNumber, setEquipmentNumber] = useState("");
  const [assetType, setAssetType] = useState("");
  const [status, setStatus] = useState("active");

  // Equipment Details
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [engineModel, setEngineModel] = useState("");
  const [engineSerialNumber, setEngineSerialNumber] = useState("");

  // Assignment
  const [division, setDivision] = useState("");
  const [assignedCrew, setAssignedCrew] = useState("");
  const [location, setLocation] = useState("");
  const [parentAssetId, setParentAssetId] = useState<string>("");
  const [parentVehicleId, setParentVehicleId] = useState<string>("");

  // Purchase Info
  const [purchaseVendorId, setPurchaseVendorId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  // Warranty
  const [warranty, setWarranty] = useState<WarrantyFormValue>(EMPTY_WARRANTY_FORM);
  const resolvedWarranty = resolveWarrantyForm(warranty, purchaseDate || null, initialData && !isDuplicate ? initialData : null);

  // Notes
  const [notes, setNotes] = useState("");

  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();

  useEffect(() => {
    if (open && initialData) {
      // When duplicating, copy most fields but clear identity-unique ones so the
      // user must explicitly set them before saving.
      setName(isDuplicate ? `Copy of ${initialData.name}` : initialData.name);
      setAssetTag(isDuplicate ? "" : initialData.assetTag);
      setEquipmentNumber(isDuplicate ? "" : (initialData.equipmentNumber ?? ""));
      setAssetType(initialData.assetType);
      setStatus(isDuplicate ? "active" : initialData.status);
      setMake(initialData.make ?? "");
      setModel(initialData.model ?? "");
      setYear(initialData.year ? String(initialData.year) : "");
      setSerialNumber(isDuplicate ? "" : (initialData.serialNumber ?? ""));
      setLicensePlate(isDuplicate ? "" : (initialData.licensePlate ?? ""));
      setEngineModel(initialData.engineModel ?? "");
      setEngineSerialNumber(isDuplicate ? "" : (initialData.engineSerialNumber ?? ""));
      setDivision(initialData.division ?? "");
      setAssignedCrew(initialData.assignedCrew ?? "");
      setLocation(initialData.location ?? "none");
      setParentAssetId(initialData.parentAssetId ?? "");
      setParentVehicleId(initialData.parentVehicleId ?? "");
      setPurchaseVendorId(isDuplicate ? "" : (initialData.purchaseVendorId ?? ""));
      setPurchaseDate(isDuplicate ? "" : (initialData.purchaseDate ?? ""));
      setPurchasePrice(isDuplicate ? "" : (initialData.purchasePrice ? (initialData.purchasePrice / 100).toFixed(2) : ""));
      setPaymentMethod(isDuplicate ? "" : (initialData.paymentMethod ?? ""));
      // A copy is a different unit with its own purchase, so its own warranty.
      setWarranty(isDuplicate ? EMPTY_WARRANTY_FORM : warrantyFormFromRecord(initialData));
      setNotes(initialData.notes ?? "");
    } else if (open && !initialData && (presetParentId || presetParentVehicleId)) {
      // Blank form for a new sub-asset — just pre-select the parent
      setParentAssetId(presetParentId ?? "");
      setParentVehicleId(presetParentVehicleId ?? "");
    }
  }, [open, initialData, isDuplicate, presetParentId, presetParentVehicleId]);

  // Asset tag uniqueness: check across all assets AND vehicles, excluding self when editing
  const existingTags = new Set([
    ...(allAssets ?? [])
      .filter((a) => a.id !== initialData?.id)
      .map((a) => a.assetTag.toLowerCase()),
    ...(allVehicles ?? [])
      .filter((v) => v.id !== initialData?.id)
      .map((v) => v.assetTag.toLowerCase()),
  ]);
  const assetTagError =
    assetTag.trim() !== "" && existingTags.has(assetTag.trim().toLowerCase())
      ? "This asset tag is already in use."
      : null;

  const isValid =
    name.trim() !== "" &&
    assetTag.trim() !== "" &&
    assetType.trim() !== "" &&
    !assetTagError &&
    !resolvedWarranty.error &&
    (!rf.isRequired("location") || (location !== "" && location !== "none")) &&
    (!rf.isRequired("serial_number") || serialNumber.trim() !== "") &&
    (!rf.isRequired("year") || year.trim() !== "") &&
    (!rf.isRequired("make_model") || make.trim() !== "");

  function handleClose() {
    onOpenChange(false);
    setName("");
    setAssetTag("");
    setEquipmentNumber("");
    setAssetType("");
    setStatus("active");
    setMake("");
    setModel("");
    setYear("");
    setSerialNumber("");
    setLicensePlate("");
    setEngineModel("");
    setEngineSerialNumber("");
    setDivision("");
    setAssignedCrew("");
    setLocation("none");
    setParentAssetId("");
    setParentVehicleId("");
    setPurchaseVendorId("");
    setPurchaseDate("");
    setPurchasePrice("");
    setPaymentMethod("");
    setWarranty(EMPTY_WARRANTY_FORM);
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const vendor = vendors?.find((v) => v.id === purchaseVendorId);
    const payload = {
      name,
      assetTag,
      equipmentNumber: equipmentNumber || null,
      assetType,
      status: status as import("@/types/cmms").AssetStatus,
      make: make || null,
      model: model || null,
      year: year ? parseInt(year) : null,
      serialNumber: serialNumber || null,
      licensePlate: licensePlate || null,
      engineSerialNumber: engineSerialNumber || null,
      engineModel: engineModel || null,
      manufacturer: null,
      airFilterPartNumber: null,
      oilFilterPartNumber: null,
      sparkPlugPartNumber: null,
      division: division || null,
      assignedCrew: assignedCrew || null,
      barcode: null,
      parentAssetId: parentAssetId || null,
      parentVehicleId: parentVehicleId || null,
      location: location !== "none" ? location : null,
      purchaseVendorId: purchaseVendorId || null,
      // A vendor typed/imported as text has a name but no linked vendor row —
      // keep it unless the user picked a different vendor.
      purchaseVendorName: vendor?.name ?? (purchaseVendorId || !isEditing ? null : (initialData?.purchaseVendorName ?? null)),
      purchaseDate: purchaseDate || null,
      purchasePrice: purchasePrice ? Math.round(parseFloat(purchasePrice) * 100) : null,
      paymentMethod: (paymentMethod as import("@/types/cmms").PaymentMethod) || null,
      financeInstitution: null,
      photoUrl: isEditing ? (initialData?.photoUrl ?? null) : null,
      notes: notes || null,
      ...resolvedWarranty.fields,
    };
    if (isEditing && initialData) {
      updateAsset.mutate({ id: initialData.id, ...payload }, { onSuccess: () => handleClose() });
    } else {
      createAsset.mutate(payload, { onSuccess: () => handleClose() });
    }
  }
  const saving = createAsset.isPending || updateAsset.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Asset" : isDuplicate ? "Duplicate Asset" : isSubAsset ? "New Sub-Asset" : "New Asset"}
          </DialogTitle>
          <DialogDescription>
            {isDuplicate
              ? "A copy of this asset has been pre-filled. Update the unique fields before saving."
              : isSubAsset
              ? "Create a new asset linked to this parent."
              : "Register a new piece of equipment in the asset registry."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] sm:max-h-[70vh] overflow-y-auto px-1">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Basic Info */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              Basic Info
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="asset-name">
                Asset Name <span className="text-red-500 dark:text-red-400">*</span>
              </Label>
              <Input
                id="asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Asset name"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="asset-tag">
                  Asset Tag <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="asset-tag"
                  value={assetTag}
                  onChange={(e) => setAssetTag(e.target.value)}
                  placeholder="e.g. A-0042"
                  className={assetTagError ? "border-red-400 focus-visible:ring-red-300 dark:focus-visible:ring-red-700" : ""}
                />
                {assetTagError && (
                  <p className="text-xs text-red-500 dark:text-red-400">{assetTagError}</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="equipment-number">Equipment #</Label>
                <Input
                  id="equipment-number"
                  value={equipmentNumber}
                  onChange={(e) => setEquipmentNumber(e.target.value)}
                  placeholder="e.g. EQ-0042"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="asset-type">
                  Asset Type <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger id="asset-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledAssetTypes.map((t) => (
                      <SelectItem key={t.id} value={t.label}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="asset-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="asset-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="in_shop">In Shop</SelectItem>
                    <SelectItem value="out_of_service">Out of Service</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="disposed">Disposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Equipment Details */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              Equipment Details
            </p>

            {rf.isVisible("make_model") && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="asset-make">Make / Model{rf.req("make_model")}</Label>
                  <Input
                    id="asset-make"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="e.g. Kubota"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="asset-model">Model</Label>
                  <Input
                    id="asset-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. ZD1211"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rf.isVisible("year") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="asset-year">Year{rf.req("year")}</Label>
                  <Input
                    id="asset-year"
                    type="number"
                    min={1900}
                    max={2030}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="e.g. 2022"
                  />
                </div>
              )}

              {rf.isVisible("serial_number") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="serial-number">Serial Number{rf.req("serial_number")}</Label>
                  <Input
                    id="serial-number"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Serial number"
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="asset-license-plate">License Plate</Label>
                <Input
                  id="asset-license-plate"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC-1234"
                  className="font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="engine-model">Engine Model</Label>
                <Input
                  id="engine-model"
                  value={engineModel}
                  onChange={(e) => setEngineModel(e.target.value)}
                  placeholder="e.g. Kubota D902"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="engine-serial">Engine Serial #</Label>
                <Input
                  id="engine-serial"
                  value={engineSerialNumber}
                  onChange={(e) => setEngineSerialNumber(e.target.value)}
                  placeholder="Engine serial number"
                />
              </div>
            </div>

            {/* Assignment */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              Assignment
            </p>

            {/* Parent Asset picker — exclude self when editing. The hierarchy is
                only ever one level deep (mirrors SubAssetsTab's "Link Existing"
                filter in AssetDetailPanel.tsx): only top-level assets (no
                parent of their own) are selectable as a parent, and an asset
                that already has sub-assets of its own can't also become a
                child — this also rules out any cycle, since a node can never
                be both a parent and a child at once. */}
            <div className="grid gap-1.5">
              <Label htmlFor="parent-asset">Parent Asset</Label>
              <Select
                value={parentVehicleId ? `vehicle:${parentVehicleId}` : parentAssetId ? `asset:${parentAssetId}` : "none"}
                onValueChange={(v) => {
                  // Value is "none" | "asset:<id>" | "vehicle:<id>" — an asset has at most one parent.
                  const [kind, id] = v.split(":");
                  setParentAssetId(kind === "asset" ? id : "");
                  setParentVehicleId(kind === "vehicle" ? id : "");
                }}
              >
                <SelectTrigger id="parent-asset">
                  <SelectValue placeholder="None (top-level asset)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top-level asset)</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Vehicles</SelectLabel>
                    {(allVehicles ?? [])
                      .filter((v) => v.deletedAt === null)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((v) => (
                        <SelectItem key={v.id} value={`vehicle:${v.id}`}>
                          {v.name}
                          {v.assetTag ? ` · ${v.assetTag}` : ""}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Assets</SelectLabel>
                    {(allAssets ?? [])
                      .filter((a) => a.id !== initialData?.id && a.deletedAt === null && !a.parentAssetId && !a.parentVehicleId)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((a) => (
                        <SelectItem key={a.id} value={`asset:${a.id}`}>
                          {a.name}
                          {a.assetTag ? ` · ${a.assetTag}` : ""}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="asset-division">Division</Label>
                <Input
                  id="asset-division"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  placeholder="e.g. Maintenance"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="assigned-crew">Assigned Crew</Label>
                <Input
                  id="assigned-crew"
                  value={assignedCrew}
                  onChange={(e) => setAssignedCrew(e.target.value)}
                  placeholder="e.g. Crew 3"
                />
              </div>
            </div>

            {rf.isVisible("location") && (
              <div className="grid gap-1.5">
                <Label htmlFor="asset-location">Location{rf.req("location")}</Label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger id="asset-location">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No location</SelectItem>
                    {enabledLocations.map((l) => (
                      <SelectItem key={l.id} value={l.label}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Purchase Info */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              Purchase Info
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="purchase-vendor">Purchase Vendor</Label>
              <VendorCombobox
                id="purchase-vendor"
                vendors={vendors ?? []}
                value={purchaseVendorId || "none"}
                onValueChange={(v) => setPurchaseVendorId(v === "none" ? "" : v)}
                noneLabel="Select a vendor"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="purchase-date">Purchase Date</Label>
                <Input
                  id="purchase-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="purchase-price">Purchase Price ($)</Label>
                <Input
                  id="purchase-price"
                  type="number"
                  step="0.01"
                  min={0}
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outright">Outright</SelectItem>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="lease">Lease</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Warranty */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              Warranty
            </p>

            <WarrantyFields
              idPrefix="asset"
              value={warranty}
              onChange={setWarranty}
              purchaseDate={purchaseDate}
              resolved={resolvedWarranty}
            />

            {/* Notes */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              Notes
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="asset-notes">Notes</Label>
              <Textarea
                id="asset-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isValid || saving}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : isDuplicate ? "Create Copy" : isSubAsset ? "Create Sub-Asset" : "Create Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
