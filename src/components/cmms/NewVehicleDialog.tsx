"use client";

import { useState, useEffect } from "react";
import type { Vehicle } from "@/types";
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
import { useVendors } from "@/lib/hooks/use-vendors";
import { useAssets } from "@/lib/hooks/use-assets";
import { useVehicles, useCreateVehicle, useUpdateVehicle } from "@/lib/hooks/use-vehicles";
import { useSettingsStore } from "@/stores/settings-store";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";

interface NewVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Vehicle | null;
}

export function NewVehicleDialog({ open, onOpenChange, initialData }: NewVehicleDialogProps) {
  const isEditing = !!initialData;
  const { data: vendors } = useVendors();
  const { data: allAssets } = useAssets();
  const { data: allVehicles } = useVehicles();
  const { assetTypes, locations, fuelTypes } = useSettingsStore();
  const enabledAssetTypes = assetTypes.filter((t) => t.enabled);
  const enabledLocations = locations.filter((l) => l.enabled);
  const enabledFuelTypes = fuelTypes.filter((f) => f.enabled);
  const rf = useRequiredFields("vehicle");

  // Basic Info
  const [name, setName] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [equipmentNumber, setEquipmentNumber] = useState("");
  const [assetType, setAssetType] = useState("");
  const [status, setStatus] = useState("active");

  // Vehicle Info
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [samsaraVehicleId, setSamsaraVehicleId] = useState("");
  const [fuelType, setFuelType] = useState("none");

  // Equipment Details
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engineModel, setEngineModel] = useState("");

  // Finance
  const [financeInstitution, setFinanceInstitution] = useState("");

  // Quick Reference Part #s
  const [airFilterPartNumber, setAirFilterPartNumber] = useState("");
  const [oilFilterPartNumber, setOilFilterPartNumber] = useState("");
  const [sparkPlugPartNumber, setSparkPlugPartNumber] = useState("");

  // Assignment
  const [division, setDivision] = useState("");
  const [assignedCrew, setAssignedCrew] = useState("");
  const [location, setLocation] = useState("");

  // Purchase Info
  const [purchaseVendorId, setPurchaseVendorId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  // Service Reminders
  const [nextOilChangeDue, setNextOilChangeDue] = useState("");
  const [nextOilChangeMileage, setNextOilChangeMileage] = useState("");
  const [nextInspectionStickerDue, setNextInspectionStickerDue] = useState("");

  // Notes
  const [notes, setNotes] = useState("");

  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setAssetTag(initialData.assetTag);
      setEquipmentNumber(initialData.equipmentNumber ?? "");
      setAssetType(initialData.assetType);
      setStatus(initialData.status);
      setMake(initialData.make ?? "");
      setModel(initialData.model ?? "");
      setYear(initialData.year ? String(initialData.year) : "");
      setEngineModel(initialData.engineModel ?? "");
      setFinanceInstitution(initialData.financeInstitution ?? "");
      setAirFilterPartNumber(initialData.airFilterPartNumber ?? "");
      setOilFilterPartNumber(initialData.oilFilterPartNumber ?? "");
      setSparkPlugPartNumber(initialData.sparkPlugPartNumber ?? "");
      setDivision(initialData.division ?? "");
      setAssignedCrew(initialData.assignedCrew ?? "");
      setLocation(initialData.location ?? "none");
      setPurchaseVendorId(initialData.purchaseVendorId ?? "");
      setPurchaseDate(initialData.purchaseDate ?? "");
      setPurchasePrice(initialData.purchasePrice ? (initialData.purchasePrice / 100).toFixed(2) : "");
      setPaymentMethod(initialData.paymentMethod ?? "");
      setNotes(initialData.notes ?? "");
      setLicensePlate(initialData.licensePlate ?? "");
      setVin(initialData.vin ?? "");
      setSamsaraVehicleId(initialData.samsaraVehicleId ?? "");
      setFuelType(initialData.fuelType ?? "none");
      setNextOilChangeDue(initialData.nextOilChangeDue ?? "");
      setNextOilChangeMileage(initialData.nextOilChangeMileage != null ? String(initialData.nextOilChangeMileage) : "");
      setNextInspectionStickerDue(initialData.nextInspectionStickerDue ?? "");
    }
  }, [open, initialData]);

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
    (!rf.isRequired("license_plate") || licensePlate.trim() !== "") &&
    (!rf.isRequired("year") || year.trim() !== "") &&
    (!rf.isRequired("make") || make.trim() !== "") &&
    (!rf.isRequired("model") || model.trim() !== "");

  function handleClose() {
    onOpenChange(false);
    setName("");
    setAssetTag("");
    setEquipmentNumber("");
    setAssetType("");
    setStatus("active");
    setLicensePlate("");
    setVin("");
    setFuelType("none");
    setNextOilChangeDue("");
    setNextOilChangeMileage("");
    setNextInspectionStickerDue("");
    setMake("");
    setModel("");
    setYear("");
    setEngineModel("");
    setFinanceInstitution("");
    setAirFilterPartNumber("");
    setOilFilterPartNumber("");
    setSparkPlugPartNumber("");
    setDivision("");
    setAssignedCrew("");
    setLocation("none");
    setPurchaseVendorId("");
    setPurchaseDate("");
    setPurchasePrice("");
    setPaymentMethod("");
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
      serialNumber: null,
      engineSerialNumber: null,
      division: division || null,
      assignedCrew: assignedCrew || null,
      barcode: null,
      parentAssetId: null,
      location: location !== "none" ? location : null,
      purchaseVendorId: purchaseVendorId || null,
      purchaseVendorName: vendor?.name ?? null,
      purchaseDate: purchaseDate || null,
      purchasePrice: purchasePrice ? Math.round(parseFloat(purchasePrice) * 100) : null,
      paymentMethod: (paymentMethod as import("@/types/cmms").PaymentMethod) || null,
      financeInstitution: financeInstitution || null,
      photoUrl: isEditing ? (initialData?.photoUrl ?? null) : null,
      notes: notes || null,
      licensePlate: licensePlate || null,
      vin: vin || null,
      samsaraVehicleId: samsaraVehicleId.trim() || null,
      fuelType: fuelType !== "none" ? fuelType : null,
      nextOilChangeDue: nextOilChangeDue || null,
      nextOilChangeMileage: nextOilChangeMileage ? parseInt(nextOilChangeMileage) : null,
      nextInspectionStickerDue: nextInspectionStickerDue || null,
      airFilterPartNumber: airFilterPartNumber || null,
      oilFilterPartNumber: oilFilterPartNumber || null,
      sparkPlugPartNumber: sparkPlugPartNumber || null,
      engineModel: engineModel || null,
      manufacturer: null,
    };
    if (isEditing && initialData) {
      updateVehicle.mutate({ id: initialData.id, ...payload }, { onSuccess: () => handleClose() });
    } else {
      createVehicle.mutate(payload, { onSuccess: () => handleClose() });
    }
  }
  const saving = createVehicle.isPending || updateVehicle.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Vehicle" : "New Vehicle"}</DialogTitle>
          <DialogDescription>
            Register a new vehicle in the fleet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
        <div className="max-h-[60dvh] sm:max-h-[70vh] overflow-y-auto px-1">
          <div className="flex flex-col gap-4">
            {/* Basic Info */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Basic Info
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="vehicle-name">
                Asset Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vehicle-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vehicle name"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-asset-tag">
                  Asset Tag <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="vehicle-asset-tag"
                  value={assetTag}
                  onChange={(e) => setAssetTag(e.target.value)}
                  placeholder="e.g. V-0012"
                  className={assetTagError ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                {assetTagError && (
                  <p className="text-xs text-red-500">{assetTagError}</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-equipment-number">Equipment #</Label>
                <Input
                  id="vehicle-equipment-number"
                  value={equipmentNumber}
                  onChange={(e) => setEquipmentNumber(e.target.value)}
                  placeholder="e.g. EQ-0012"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-type">
                  Asset Type <span className="text-red-500">*</span>
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
                <Label htmlFor="vehicle-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="vehicle-status">
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

            {/* Vehicle Info */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Vehicle Info
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rf.isVisible("license_plate") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="license-plate">License Plate{rf.req("license_plate")}</Label>
                  <Input
                    id="license-plate"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value)}
                    placeholder="e.g. ABC-1234"
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  placeholder="17-character VIN"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-fuel-type">Fuel Type</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger id="vehicle-fuel-type">
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {enabledFuelTypes.map((f) => (
                      <SelectItem key={f.id} value={f.label}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Integrations */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Integrations
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="samsara-vehicle-id">Samsara Vehicle ID</Label>
              <Input
                id="samsara-vehicle-id"
                value={samsaraVehicleId}
                onChange={(e) => setSamsaraVehicleId(e.target.value)}
                placeholder="e.g. 281474978122443"
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-400">
                Found in Samsara under Fleet → Vehicles → select vehicle → ID in the URL.
                Used for reliable odometer sync matching.
              </p>
            </div>

            {/* Service Reminders */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Service Reminders
            </p>

            {/* Oil Change — date + mileage side by side */}
            <div>
              <p className="mb-1.5 text-xs text-slate-500">
                Oil Change — set a date, mileage, or both (whichever comes first)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="next-oil-change-date">Due Date</Label>
                  <Input
                    id="next-oil-change-date"
                    type="date"
                    value={nextOilChangeDue}
                    onChange={(e) => setNextOilChangeDue(e.target.value)}
                  />
                </div>
                {rf.isVisible("mileage") && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="next-oil-change-mileage">Due Mileage{rf.req("mileage")}</Label>
                    <div className="relative">
                      <Input
                        id="next-oil-change-mileage"
                        type="number"
                        min={0}
                        value={nextOilChangeMileage}
                        onChange={(e) => setNextOilChangeMileage(e.target.value)}
                        placeholder="e.g. 85000"
                        className="pr-8"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        mi
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="next-inspection">Next Inspection Sticker Due</Label>
              <Input
                id="next-inspection"
                type="date"
                value={nextInspectionStickerDue}
                onChange={(e) => setNextInspectionStickerDue(e.target.value)}
              />
            </div>

            {/* Equipment Details */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Equipment Details
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rf.isVisible("make") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="vehicle-make">Make{rf.req("make")}</Label>
                  <Input
                    id="vehicle-make"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="e.g. Ford"
                  />
                </div>
              )}

              {rf.isVisible("model") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="vehicle-model">Model{rf.req("model")}</Label>
                  <Input
                    id="vehicle-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. F-250"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rf.isVisible("year") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="vehicle-year">Year{rf.req("year")}</Label>
                  <Input
                    id="vehicle-year"
                    type="number"
                    min={1900}
                    max={2030}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="e.g. 2023"
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-engine-model">Engine Model</Label>
                <Input
                  id="vehicle-engine-model"
                  value={engineModel}
                  onChange={(e) => setEngineModel(e.target.value)}
                  placeholder="e.g. 6.7L Power Stroke"
                />
              </div>
            </div>

            {/* Assignment */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Assignment
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-division">Division</Label>
                <Input
                  id="vehicle-division"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  placeholder="e.g. Maintenance"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-assigned-crew">Assigned Crew</Label>
                <Input
                  id="vehicle-assigned-crew"
                  value={assignedCrew}
                  onChange={(e) => setAssignedCrew(e.target.value)}
                  placeholder="e.g. Crew 3"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="vehicle-location">Location</Label>
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

            {/* Purchase Info */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Purchase Info
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="vehicle-purchase-vendor">Purchase Vendor</Label>
              <Select value={purchaseVendorId} onValueChange={setPurchaseVendorId}>
                <SelectTrigger id="vehicle-purchase-vendor">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-purchase-date">Purchase Date</Label>
                <Input
                  id="vehicle-purchase-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-purchase-price">Purchase Price ($)</Label>
                <Input
                  id="vehicle-purchase-price"
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
                <Label htmlFor="vehicle-payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="vehicle-payment-method">
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

              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-finance-institution">Finance Institution</Label>
                <Input
                  id="vehicle-finance-institution"
                  value={financeInstitution}
                  onChange={(e) => setFinanceInstitution(e.target.value)}
                  placeholder="e.g. Ford Motor Credit"
                />
              </div>
            </div>

            {/* Quick Reference Part #s */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Quick Reference Part #&apos;s
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-air-filter">Air Filter</Label>
                <Input
                  id="vehicle-air-filter"
                  value={airFilterPartNumber}
                  onChange={(e) => setAirFilterPartNumber(e.target.value)}
                  placeholder="Part #"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-oil-filter">Oil Filter</Label>
                <Input
                  id="vehicle-oil-filter"
                  value={oilFilterPartNumber}
                  onChange={(e) => setOilFilterPartNumber(e.target.value)}
                  placeholder="Part #"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vehicle-spark-plug">Spark Plug</Label>
                <Input
                  id="vehicle-spark-plug"
                  value={sparkPlugPartNumber}
                  onChange={(e) => setSparkPlugPartNumber(e.target.value)}
                  placeholder="Part #"
                />
              </div>
            </div>

            {/* Notes */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="vehicle-notes">Notes</Label>
              <Textarea
                id="vehicle-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isValid || saving}
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Vehicle"}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
