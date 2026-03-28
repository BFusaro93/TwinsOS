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
import { useUsers } from "@/lib/hooks/use-users";
import { useCreateWorkOrder, useUpdateWorkOrder } from "@/lib/hooks/use-work-orders";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsStore } from "@/stores/settings-store";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { EntityCombobox } from "@/components/shared/EntityCombobox";
import { MultiEntityCombobox } from "@/components/shared/MultiEntityCombobox";
import { Info } from "lucide-react";
import type { WorkOrder } from "@/types";

interface NewWorkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: WorkOrder | null;
}

// Combined option representing either an asset or vehicle
interface EntityOption {
  id: string;
  name: string;
  subtitle: string;
  type: "asset" | "vehicle";
}

const ASSET_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "active", label: ASSET_STATUS_LABELS.active },
  { value: "inactive", label: ASSET_STATUS_LABELS.inactive },
  { value: "in_shop", label: ASSET_STATUS_LABELS.in_shop },
  { value: "out_of_service", label: ASSET_STATUS_LABELS.out_of_service },
  { value: "disposed", label: ASSET_STATUS_LABELS.disposed },
];

export function NewWorkOrderDialog({ open, onOpenChange, initialData }: NewWorkOrderDialogProps) {
  const isEditing = !!initialData;

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [woType, setWoType] = useState("none");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [entityKey, setEntityKey] = useState("none"); // used in edit mode: "asset:<id>" | "vehicle:<id>" | "none"
  const [entityKeys, setEntityKeys] = useState<string[]>([]); // used in create mode (multi-select)
  const [dueDate, setDueDate] = useState("");
  // Assigned to — multi-select user IDs
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  // Optional status change for the linked asset/vehicle (only in single-select mode)
  const [newEntityStatus, setNewEntityStatus] = useState("no_change");
  const [description, setDescription] = useState("");
  // Recurrence
  const [recurrenceFrequency, setRecurrenceFrequency] = useState("none");

  const createWO = useCreateWorkOrder();
  const updateWO = useUpdateWorkOrder();

  const { data: assets } = useAssets();
  const { data: vehicles } = useVehicles();
  const { data: users } = useUsers();
  const { woCategories } = useSettingsStore();
  const enabledCategories = woCategories.filter((c) => c.enabled);
  const rf = useRequiredFields("work_order");

  // Build unified entity list (excluding disposed items)
  const entityOptions: EntityOption[] = [
    ...(assets ?? [])
      .filter((a) => a.status !== "disposed")
      .map((a) => ({
        id: `asset:${a.id}`,
        name: a.name,
        subtitle: [a.make, a.model, a.assetTag].filter(Boolean).join(" · "),
        type: "asset" as const,
      })),
    ...(vehicles ?? [])
      .filter((v) => v.status !== "disposed")
      .map((v) => ({
        id: `vehicle:${v.id}`,
        name: v.name,
        subtitle: [v.year, v.make, v.model, v.licensePlate].filter(Boolean).join(" · "),
        type: "vehicle" as const,
      })),
  ];

  const selectedEntity = entityOptions.find((e) => e.id === entityKey) ?? null;
  // In create mode: show status change only when exactly one entity is selected
  const showStatusChange = isEditing ? selectedEntity !== null : entityKeys.length === 1;
  const singleCreateEntity = !isEditing && entityKeys.length === 1
    ? entityOptions.find((e) => e.id === entityKeys[0]) ?? null
    : null;
  const statusChangeEntity = isEditing ? selectedEntity : singleCreateEntity;

  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title);
      setPriority(initialData.priority);
      setWoType(initialData.woType ?? "none");
      setCategoryIds(initialData.categories?.length ? initialData.categories : (initialData.category ? [initialData.category] : []));
      // Reconstruct entity key from stored data
      if (initialData.assetId) {
        const type = initialData.linkedEntityType ?? "asset";
        setEntityKey(`${type}:${initialData.assetId}`);
      } else {
        setEntityKey("none");
      }
      setDueDate(initialData.dueDate ?? "");
      // Assigned to — load multi-assignee IDs
      setAssignedToIds(
        initialData.assignedToIds?.length
          ? initialData.assignedToIds
          : initialData.assignedToId
            ? [initialData.assignedToId]
            : []
      );
      setDescription(initialData.description ?? "");
      setNewEntityStatus("no_change");
      setRecurrenceFrequency(initialData.recurrenceFrequency ?? "none");
    }
  }, [open, initialData, users]);

  const isValid = title.trim() && priority
    && (!rf.isRequired("category") || categoryIds.length > 0)
    && (!rf.isRequired("assigned_to") || assignedToIds.length > 0)
    && (!rf.isRequired("due_date") || dueDate !== "");

  function handleClose() {
    onOpenChange(false);
    setTitle("");
    setPriority("medium");
    setWoType("none");
    setCategoryIds([]);
    setEntityKey("none");
    setEntityKeys([]);
    setDueDate("");
    setAssignedToIds([]);
    setNewEntityStatus("no_change");
    setDescription("");
    setRecurrenceFrequency("none");
  }

  function buildEntityFields(key: string): {
    assetId: string | null;
    assetName: string | null;
    linkedEntityType: "asset" | "vehicle" | null;
  } {
    if (!key || key === "none") return { assetId: null, assetName: null, linkedEntityType: null };
    const [type, id] = key.split(":");
    const entityOpt = entityOptions.find((e) => e.id === key);
    return {
      assetId: id ?? null,
      assetName: entityOpt?.name ?? null,
      linkedEntityType: (type as "asset" | "vehicle") ?? null,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const resolvedNames = assignedToIds
      .map((id) => (users ?? []).find((u) => u.id === id)?.name ?? "")
      .filter(Boolean);
    const commonFields = {
      title,
      description: description || null,
      status: "open" as import("@/types/cmms").WorkOrderStatus,
      priority: priority as import("@/types/cmms").WorkOrderPriority,
      woType: woType !== "none" ? (woType as "reactive" | "preventive") : null,
      category: categoryIds[0] ?? null,
      categories: categoryIds,
      assignedToId: assignedToIds[0] ?? null,
      assignedToName: (users ?? []).find((u) => u.id === assignedToIds[0])?.name ?? null,
      assignedToIds: assignedToIds,
      assignedToNames: resolvedNames,
      dueDate: dueDate || null,
      isRecurring: recurrenceFrequency !== "none",
      recurrenceFrequency: recurrenceFrequency !== "none"
        ? (recurrenceFrequency as import("@/types/cmms").WorkOrder["recurrenceFrequency"])
        : null,
      parentWorkOrderId: null,
      pmScheduleId: null,
    };
    if (isEditing && initialData) {
      updateWO.mutate(
        { id: initialData.id, ...commonFields, ...buildEntityFields(entityKey) },
        { onSuccess: () => handleClose() }
      );
    } else if (entityKeys.length > 1) {
      // Multi-entity: create parent WO then sub-WOs
      const parentNumber = `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      createWO.mutate(
        {
          ...commonFields,
          workOrderNumber: parentNumber,
          assetId: null,
          assetName: null,
          linkedEntityType: null,
        },
        {
          onSuccess: (parent) => {
            let remaining = entityKeys.length;
            entityKeys.forEach((key, i) => {
              const subNumber = `WO-${new Date().getFullYear()}-${(Date.now() + i + 1).toString().slice(-6)}`;
              createWO.mutate(
                {
                  ...commonFields,
                  workOrderNumber: subNumber,
                  parentWorkOrderId: parent.id,
                  ...buildEntityFields(key),
                },
                {
                  onSuccess: () => {
                    remaining -= 1;
                    if (remaining === 0) handleClose();
                  },
                }
              );
            });
          },
        }
      );
    } else {
      const workOrderNumber = `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      createWO.mutate(
        {
          ...commonFields,
          workOrderNumber,
          ...buildEntityFields(entityKeys[0] ?? "none"),
        },
        { onSuccess: () => handleClose() }
      );
    }
  }
  const saving = createWO.isPending || updateWO.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Work Order" : "New Work Order"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update work order details."
              : "Create a new work order to track maintenance or repair tasks."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[72vh] overflow-y-auto px-1">
            <div className="flex flex-col gap-4 pb-2">

              {/* Title */}
              <div className="grid gap-1.5">
                <Label htmlFor="wo-title">
                  Work Order Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="wo-title"
                  placeholder="Describe the work to be done"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Priority + Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-priority">
                    Priority{rf.req("priority")}
                  </Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="wo-priority">
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

                <div className="grid gap-1.5">
                  <Label htmlFor="wo-type">Type</Label>
                  <Select value={woType} onValueChange={setWoType}>
                    <SelectTrigger id="wo-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unspecified</SelectItem>
                      <SelectItem value="reactive">Reactive</SelectItem>
                      <SelectItem value="preventive">Preventive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Category (multi-select) */}
              {rf.isVisible("category") && (
                <div className="grid gap-1.5">
                  <Label>Category{rf.req("category")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal h-10">
                        {categoryIds.length === 0
                          ? "Select categories..."
                          : categoryIds.map((id) => enabledCategories.find((c) => c.id === id)?.label ?? id).join(", ")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {enabledCategories.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
                            <Checkbox
                              checked={categoryIds.includes(c.id)}
                              onCheckedChange={(checked) => {
                                setCategoryIds((prev) =>
                                  checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                                );
                              }}
                            />
                            <span className="text-sm">{c.label}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Asset / Vehicle */}
              <div className="grid gap-1.5">
                <Label htmlFor="wo-entity">Asset / Vehicle</Label>
                {isEditing ? (
                  <EntityCombobox
                    id="wo-entity"
                    assets={assets ?? []}
                    vehicles={vehicles ?? []}
                    value={entityKey}
                    onValueChange={setEntityKey}
                    noneLabel="None"
                  />
                ) : (
                  <MultiEntityCombobox
                    id="wo-entity"
                    assets={assets ?? []}
                    vehicles={vehicles ?? []}
                    values={entityKeys}
                    onValuesChange={setEntityKeys}
                  />
                )}
              </div>

              {/* Multi-asset info banner */}
              {!isEditing && entityKeys.length > 1 && (
                <div className="flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>
                    A <strong>parent work order</strong> will be created with{" "}
                    <strong>{entityKeys.length} sub work orders</strong>, one per selected asset / vehicle.
                  </span>
                </div>
              )}

              {/* Update asset/vehicle status — only shown when exactly one entity is selected */}
              {showStatusChange && statusChangeEntity && (
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-entity-status">
                    Update {statusChangeEntity.type === "vehicle" ? "Vehicle" : "Asset"} Status
                    <span className="ml-1.5 text-xs font-normal text-slate-400">(optional)</span>
                  </Label>
                  <Select value={newEntityStatus} onValueChange={setNewEntityStatus}>
                    <SelectTrigger id="wo-entity-status" className="border-slate-200 bg-slate-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_change">No change</SelectItem>
                      {ASSET_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Assigned To + Due Date */}
              <div className="grid grid-cols-2 gap-4">
                {rf.isVisible("assigned_to") && (
                  <div className="grid gap-1.5">
                    <Label>Assigned To{rf.req("assigned_to")}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal h-10">
                          {assignedToIds.length === 0
                            ? "Select assignees..."
                            : `${assignedToIds.length} assigned`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start">
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                          {(users ?? []).map((u) => (
                            <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
                              <Checkbox
                                checked={assignedToIds.includes(u.id)}
                                onCheckedChange={(checked) => {
                                  setAssignedToIds((prev) =>
                                    checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                                  );
                                }}
                              />
                              <span className="text-sm">{u.name}</span>
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {rf.isVisible("due_date") && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="wo-due-date">Due Date{rf.req("due_date")}</Label>
                    <Input
                      id="wo-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="grid gap-1.5">
                <Label htmlFor="wo-description">Description / Notes</Label>
                <Textarea
                  id="wo-description"
                  rows={3}
                  placeholder="Additional details about the work to be done"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Recurrence */}
              <div className="grid gap-1.5">
                <Label htmlFor="wo-recurrence">Recurrence</Label>
                <Select value={recurrenceFrequency} onValueChange={setRecurrenceFrequency}>
                  <SelectTrigger id="wo-recurrence">
                    <SelectValue placeholder="Does not repeat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
                {recurrenceFrequency !== "none" && (
                  <p className="text-xs text-slate-500">
                    A new work order will be generated automatically at this interval once the current one is marked done.
                  </p>
                )}
              </div>

            </div>
          </div>

          <DialogFooter className="mt-4 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Work Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
