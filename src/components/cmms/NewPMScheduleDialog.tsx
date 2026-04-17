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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useCreatePMSchedule, useUpdatePMSchedule } from "@/lib/hooks/use-pm-schedules";
import { useAddPMScheduleAsset, usePMScheduleAssets, useRemovePMScheduleAsset } from "@/lib/hooks/use-pm-schedule-assets";
import { X } from "lucide-react";
import type { PMSchedule } from "@/types";

interface NewPMScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: PMSchedule | null;
  onCreated?: (id: string) => void;
}

interface SelectedAsset {
  key: string;   // "asset:<id>" | "vehicle:<id>"
  id: string;
  name: string;
}

export function NewPMScheduleDialog({ open, onOpenChange, initialData, onCreated }: NewPMScheduleDialogProps) {
  const isEditing = !!initialData;
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [description, setDescription] = useState("");

  // Multi-asset selection
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [pickerKey, setPickerKey] = useState("");   // currently-selected value in the combobox

  const { data: assets } = useAssets();
  const { data: vehicles } = useVehicles();

  // When editing, load existing linked assets from the join table
  const { data: existingAssets } = usePMScheduleAssets(initialData?.id ?? "");

  const createPMSchedule = useCreatePMSchedule();
  const updatePMSchedule = useUpdatePMSchedule();
  const addAsset = useAddPMScheduleAsset();
  const removeAsset = useRemovePMScheduleAsset();

  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title);
      setFrequency(initialData.frequency);
      setNextDueDate(initialData.nextDueDate ?? "");
      setDescription(initialData.description ?? "");
    }
    if (!open) {
      // Reset on close
      setTitle("");
      setFrequency("");
      setNextDueDate("");
      setDescription("");
      setSelectedAssets([]);
      setPickerKey("");
    }
  }, [open, initialData]);

  // Populate selectedAssets from join table when editing
  useEffect(() => {
    if (isEditing && existingAssets && existingAssets.length > 0) {
      setSelectedAssets(
        existingAssets.map((ea) => ({
          key: `asset:${ea.assetId}`,
          id: ea.assetId,
          name: ea.assetName,
        }))
      );
    }
  }, [isEditing, existingAssets]);

  const isValid = title.trim() && frequency && nextDueDate && selectedAssets.length > 0;

  function resolveEntityName(key: string): string {
    const [, id] = key.split(":");
    return (
      (assets ?? []).find((a) => a.id === id)?.name ??
      (vehicles ?? []).find((v) => v.id === id)?.name ??
      ""
    );
  }

  function handleAddAsset(key: string) {
    if (!key || key === "none") return;
    const [, id] = key.split(":");
    if (selectedAssets.some((a) => a.id === id)) return; // already added
    const name = resolveEntityName(key);
    setSelectedAssets((prev) => [...prev, { key, id, name }]);
    setPickerKey(""); // reset picker
  }

  function handleRemoveAsset(id: string) {
    setSelectedAssets((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const payload = {
      title,
      assetId: null,
      assetName: selectedAssets.map((a) => a.name).join(", "),
      frequency: frequency as PMSchedule["frequency"],
      nextDueDate,
      lastCompletedDate: null,
      isActive: true,
      description: description || null,
    };

    if (isEditing && initialData) {
      // Update schedule metadata
      await updatePMSchedule.mutateAsync({ id: initialData.id, ...payload });

      // Diff assets: remove those that were deselected, add new ones
      const existingIds = new Set((existingAssets ?? []).map((ea) => ea.assetId));
      const selectedIds = new Set(selectedAssets.map((a) => a.id));

      // Remove deselected
      for (const ea of existingAssets ?? []) {
        if (!selectedIds.has(ea.assetId)) {
          await removeAsset.mutateAsync({ id: ea.id, pmScheduleId: initialData.id });
        }
      }
      // Add new
      for (const sa of selectedAssets) {
        if (!existingIds.has(sa.id)) {
          await addAsset.mutateAsync({
            pmScheduleId: initialData.id,
            assetId: sa.id,
            assetName: sa.name,
          });
        }
      }
      onOpenChange(false);
    } else {
      // Create schedule, then add all assets
      const created = await createPMSchedule.mutateAsync(payload);
      for (const sa of selectedAssets) {
        await addAsset.mutateAsync({
          pmScheduleId: created.id,
          assetId: sa.id,
          assetName: sa.name,
        });
      }
      onCreated?.(created.id);
      onOpenChange(false);
    }
  }

  const saving =
    createPMSchedule.isPending ||
    updatePMSchedule.isPending ||
    addAsset.isPending ||
    removeAsset.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit PM Schedule" : "New PM Schedule"}</DialogTitle>
          <DialogDescription>
            Set up a recurring preventive maintenance schedule. Add all assets or vehicles that
            receive the same service — each one gets its own sub-work order when generated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {/* Schedule Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-title">
                Schedule Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="pm-title"
                placeholder="e.g. Weekly Mower Service"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Multi-Asset Selector */}
            <div className="grid gap-1.5">
              <Label>
                Assets / Vehicles <span className="text-red-500">*</span>
              </Label>

              {/* Selected asset badges */}
              {selectedAssets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedAssets.map((a) => (
                    <Badge
                      key={a.id}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1 text-xs"
                    >
                      {a.name}
                      <button
                        type="button"
                        className="ml-0.5 rounded hover:bg-slate-300"
                        onClick={() => handleRemoveAsset(a.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Picker — resets to placeholder after each selection */}
              <EntityCombobox
                assets={assets ?? []}
                vehicles={vehicles ?? []}
                value={pickerKey || "none"}
                onValueChange={(val) => {
                  if (val !== "none") handleAddAsset(val);
                }}
                noneLabel={selectedAssets.length > 0 ? "Add another asset…" : "Select asset or vehicle"}
              />
              {selectedAssets.length === 0 && (
                <p className="text-xs text-slate-500">
                  Select one or more assets. Each gets its own sub-work order when WOs are generated.
                </p>
              )}
            </div>

            {/* Frequency + Next Due Date */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pm-frequency">
                  Frequency <span className="text-red-500">*</span>
                </Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger id="pm-frequency">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="pm-next-due">
                  Next Due Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="pm-next-due"
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-description">Instructions / Description</Label>
              <Textarea
                id="pm-description"
                rows={3}
                placeholder="Describe the maintenance tasks for all assets in this schedule…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
