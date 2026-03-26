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
import type { PMSchedule } from "@/types";

interface NewPMScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: PMSchedule | null;
}

export function NewPMScheduleDialog({ open, onOpenChange, initialData }: NewPMScheduleDialogProps) {
  const isEditing = !!initialData;
  const [title, setTitle] = useState("");
  // "asset:<id>" | "vehicle:<id>" | ""
  const [entityKey, setEntityKey] = useState("");
  const [frequency, setFrequency] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [description, setDescription] = useState("");

  const { data: assets } = useAssets();
  const { data: vehicles } = useVehicles();
  const createPMSchedule = useCreatePMSchedule();
  const updatePMSchedule = useUpdatePMSchedule();

  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title);
      // PM schedules only stored assetId — default to asset prefix when editing
      setEntityKey(initialData.assetId ? `asset:${initialData.assetId}` : "");
      setFrequency(initialData.frequency);
      setNextDueDate(initialData.nextDueDate ?? "");
      setDescription(initialData.description ?? "");
    }
  }, [open, initialData]);

  const isValid = title.trim() && entityKey && entityKey !== "none" && frequency && nextDueDate;

  function handleClose() {
    onOpenChange(false);
    setTitle("");
    setEntityKey("");
    setFrequency("");
    setNextDueDate("");
    setDescription("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const [entityType, entityId] = entityKey.split(":");
    const asset = (assets ?? []).find((a) => a.id === entityId);
    const vehicle = (vehicles ?? []).find((v) => v.id === entityId);
    const entityName = asset?.name ?? vehicle?.name ?? "";
    const payload = {
      title,
      assetId: entityId,
      assetName: entityName,
      frequency: frequency as PMSchedule["frequency"],
      nextDueDate,
      lastCompletedDate: null,
      isActive: true,
      description: description || null,
    };
    void entityType; // used to resolve name above; PM schedule only stores assetId
    if (isEditing && initialData) {
      updatePMSchedule.mutate({ id: initialData.id, ...payload }, { onSuccess: () => handleClose() });
    } else {
      createPMSchedule.mutate(payload, { onSuccess: () => handleClose() });
    }
  }
  const saving = createPMSchedule.isPending || updatePMSchedule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit PM Schedule" : "New PM Schedule"}</DialogTitle>
          <DialogDescription>
            Set up a recurring preventive maintenance schedule for an asset or vehicle.
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
                placeholder="e.g. Monthly Oil Change"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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

            {/* Frequency + Next Due Date */}
            <div className="grid grid-cols-2 gap-4">
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
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
