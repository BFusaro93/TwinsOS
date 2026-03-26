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
import { useCreateRequest, useUpdateRequest } from "@/lib/hooks/use-requests";
import { useUsers } from "@/lib/hooks/use-users";
import type { MaintenanceRequest } from "@/types";

interface NewRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: MaintenanceRequest | null;
}

export function NewRequestDialog({ open, onOpenChange, initialData }: NewRequestDialogProps) {
  const isEditing = !!initialData;
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  // "asset:<id>" | "vehicle:<id>" | "none"
  const [entityKey, setEntityKey] = useState("none");
  const [description, setDescription] = useState("");

  const { data: assets } = useAssets();
  const { data: vehicles } = useVehicles();
  const { data: users } = useUsers();
  const createRequest = useCreateRequest();
  const updateRequest = useUpdateRequest();

  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title);
      setPriority(initialData.priority);
      // Requests only stored assetId — we don't know if it was a vehicle; default to asset prefix
      setEntityKey(initialData.assetId ? `asset:${initialData.assetId}` : "none");
      setDescription(initialData.description ?? "");
    }
  }, [open, initialData]);

  const isValid = title.trim() && description.trim() && priority;

  function handleClose() {
    onOpenChange(false);
    setTitle("");
    setPriority("medium");
    setEntityKey("none");
    setDescription("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const [, entityId] = entityKey !== "none" ? entityKey.split(":") : ["", ""];
    const asset = (assets ?? []).find((a) => a.id === entityId);
    const vehicle = (vehicles ?? []).find((v) => v.id === entityId);
    const entityName = asset?.name ?? vehicle?.name ?? undefined;
    const resolvedAssetId = entityId || null;
    if (isEditing && initialData) {
      updateRequest.mutate(
        {
          id: initialData.id,
          title,
          description,
          priority: priority as import("@/types/cmms").WorkOrderPriority,
          assetId: resolvedAssetId,
          assetName: entityName ?? null,
        },
        { onSuccess: () => handleClose() }
      );
    } else {
      // Resolve current user name for requestedByName
      const currentUserName = users?.[0]?.name ?? "Unknown";
      createRequest.mutate(
        {
          title,
          description,
          priority: priority as import("@/types/cmms").WorkOrderPriority,
          requestedByName: currentUserName,
          assetId: resolvedAssetId,
          assetName: entityName,
        },
        { onSuccess: () => handleClose() }
      );
    }
  }
  const saving = createRequest.isPending || updateRequest.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Request" : "New Maintenance Request"}</DialogTitle>
          <DialogDescription>Submit a maintenance request for review.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {/* Request Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="req-title">
                Request Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="req-title"
                placeholder="Briefly describe the issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Priority */}
            <div className="grid gap-1.5">
              <Label htmlFor="req-priority">
                Priority <span className="text-red-500">*</span>
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="req-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Asset / Vehicle */}
            <div className="grid gap-1.5">
              <Label>Asset / Vehicle (optional)</Label>
              <EntityCombobox
                assets={assets ?? []}
                vehicles={vehicles ?? []}
                value={entityKey}
                onValueChange={setEntityKey}
                noneLabel="No asset or vehicle"
              />
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label htmlFor="req-description">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="req-description"
                rows={3}
                placeholder="Provide details about the maintenance needed"
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
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
