"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssets } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { EntityCombobox } from "@/components/shared/EntityCombobox";
import { useCreateMeter, useUpdateMeter } from "@/lib/hooks/use-meters";
import type { Meter } from "@/types";

interface NewMeterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Meter | null;
}

export function NewMeterDialog({ open, onOpenChange, initialData }: NewMeterDialogProps) {
  const isEditing = !!initialData;

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  // "asset:<id>" | "vehicle:<id>" | ""
  const [entityKey, setEntityKey] = useState("");
  const [source, setSource] = useState<"manual" | "samsara">("manual");
  const [currentReading, setCurrentReading] = useState("");
  const [pmThreshold, setPmThreshold] = useState("");

  const { data: assets } = useAssets();
  const { data: vehicles } = useVehicles();
  const createMeter = useCreateMeter();
  const updateMeter = useUpdateMeter();

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setUnit(initialData.unit);
      // Resolve entity key from stored assetId — check vehicles first, then assets
      const isVehicle = (vehicles ?? []).some((v) => v.id === initialData.assetId);
      setEntityKey(
        initialData.assetId
          ? `${isVehicle ? "vehicle" : "asset"}:${initialData.assetId}`
          : ""
      );
      setSource(initialData.source);
      setPmThreshold("");
    }
  }, [open, initialData, assets, vehicles]);

  const isValid =
    name.trim() &&
    unit.trim() &&
    entityKey && entityKey !== "none" &&
    source &&
    (isEditing || currentReading !== "");

  function handleClose() {
    onOpenChange(false);
    setName("");
    setUnit("");
    setEntityKey("");
    setSource("manual");
    setCurrentReading("");
    setPmThreshold("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const [, entityId] = entityKey.split(":");
    const asset = (assets ?? []).find((a) => a.id === entityId);
    const vehicle = (vehicles ?? []).find((v) => v.id === entityId);
    const entityName = asset?.name ?? vehicle?.name ?? "";
    const now = new Date().toISOString();
    if (isEditing && initialData) {
      updateMeter.mutate(
        { id: initialData.id, name, unit, assetId: entityId, assetName: entityName, source },
        { onSuccess: () => handleClose() }
      );
    } else {
      createMeter.mutate(
        {
          name,
          unit,
          assetId: entityId,
          assetName: entityName,
          source,
          currentValue: currentReading !== "" ? parseFloat(currentReading) : 0,
          lastReadingAt: now,
        },
        { onSuccess: () => handleClose() }
      );
    }
  }
  const saving = createMeter.isPending || updateMeter.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Meter" : "New Meter"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details for this meter."
              : "Add a new meter to track equipment usage."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {/* Meter Name */}
            <div className="grid gap-1.5">
              <Label htmlFor="meter-name">
                Meter Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="meter-name"
                placeholder="e.g. Engine Hours, Odometer"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Asset / Vehicle */}
            <div className="grid gap-1.5">
              <Label>
                Asset / Vehicle <span className="text-red-500">*</span>
              </Label>
              <EntityCombobox
                assets={assets ?? []}
                vehicles={vehicles ?? []}
                value={entityKey || "none"}
                onValueChange={(val) => setEntityKey(val === "none" ? "" : val)}
                noneLabel="Select asset or vehicle"
                required
              />
            </div>

            {/* Unit + Source */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="meter-unit">
                  Unit <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="meter-unit"
                  placeholder="e.g. hours, miles"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="meter-source">
                  Source <span className="text-red-500">*</span>
                </Label>
                <Select value={source} onValueChange={(v) => setSource(v as "manual" | "samsara")}>
                  <SelectTrigger id="meter-source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="samsara">Samsara</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Current Reading — only shown when creating */}
            {!isEditing && (
              <div className="grid gap-1.5">
                <Label htmlFor="meter-current">
                  Current Reading <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="meter-current"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={currentReading}
                  onChange={(e) => setCurrentReading(e.target.value)}
                />
              </div>
            )}

            {/* PM Threshold */}
            <div className="grid gap-1.5">
              <Label htmlFor="meter-threshold">PM Threshold (optional)</Label>
              <Input
                id="meter-threshold"
                type="number"
                min={0}
                placeholder="e.g. 5000"
                value={pmThreshold}
                onChange={(e) => setPmThreshold(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                The reading value at which a preventive maintenance task should trigger.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Meter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
