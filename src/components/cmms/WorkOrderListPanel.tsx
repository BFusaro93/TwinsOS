"use client";

import { cn, formatDate, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { useUsers } from "@/lib/hooks/use-users";
import { useUpdateWorkOrder } from "@/lib/hooks/use-work-orders";
import { useSettingsStore } from "@/stores";
import { ChevronDown, GitBranch } from "lucide-react";
import type { WorkOrder } from "@/types";

interface WorkOrderListPanelProps {
  workOrders: WorkOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function AssigneeMultiSelect({
  wo,
  users,
  updateWO,
}: {
  wo: WorkOrder;
  users: Array<{ id: string; name: string }>;
  updateWO: (input: Partial<WorkOrder> & { id: string }) => void;
}) {
  const selectedIds = wo.assignedToIds.length > 0 ? wo.assignedToIds : (wo.assignedToId ? [wo.assignedToId] : []);

  function handleToggle(userId: string, checked: boolean) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    let nextIds: string[];
    let nextNames: string[];
    if (checked) {
      nextIds = [...selectedIds, userId];
      nextNames = [...(wo.assignedToNames.length > 0 ? wo.assignedToNames : (wo.assignedToName ? [wo.assignedToName] : [])), user.name];
    } else {
      const idx = selectedIds.indexOf(userId);
      nextIds = selectedIds.filter((_, i) => i !== idx);
      nextNames = (wo.assignedToNames.length > 0 ? wo.assignedToNames : (wo.assignedToName ? [wo.assignedToName] : [])).filter((_, i) => i !== idx);
    }

    updateWO({
      id: wo.id,
      assignedToId: nextIds[0] ?? null,
      assignedToName: nextNames[0] ?? null,
      assignedToIds: nextIds,
      assignedToNames: nextNames,
    });
  }

  const displayNames = wo.assignedToNames.length > 0
    ? wo.assignedToNames
    : (wo.assignedToName ? [wo.assignedToName] : []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 w-[120px] items-center justify-between rounded-md border border-input bg-background px-2 text-[11px] ring-offset-background hover:bg-accent hover:text-accent-foreground"
        >
          <span className="truncate">
            {displayNames.length === 0
              ? "Assign..."
              : displayNames.length === 1
                ? displayNames[0]
                : `${displayNames.length} assigned`}
          </span>
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="flex max-h-48 flex-col overflow-y-auto">
          {users.map((u) => {
            const isChecked = selectedIds.includes(u.id);
            return (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => handleToggle(u.id, !!checked)}
                />
                <span className="truncate">{u.name}</span>
              </label>
            );
          })}
          {users.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-slate-400">No users</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WorkOrderListPanel({ workOrders, selectedId, onSelect }: WorkOrderListPanelProps) {
  const { data: users = [] } = useUsers();
  const { mutate: updateWO } = useUpdateWorkOrder();
  const { woCategories } = useSettingsStore();

  // Build a map of parent WO id → child count for "Parent" pill
  const childCountMap = new Map<string, number>();
  for (const wo of workOrders) {
    if (wo.parentWorkOrderId) {
      childCountMap.set(wo.parentWorkOrderId, (childCountMap.get(wo.parentWorkOrderId) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {workOrders.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No work orders found
        </p>
      )}
      {workOrders.map((wo) => {
        const isSelected = wo.id === selectedId;
        const label = wo.assetName ?? wo.title;
        const initials = getInitials(label);
        const avatarColor = getAvatarColor(label);

        return (
          <button
            key={wo.id}
            onClick={() => onSelect(wo.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 hover:bg-brand-50"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                avatarColor
              )}
            >
              {initials}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {wo.workOrderNumber}
                </span>
                {wo.dueDate && (
                  <span className="shrink-0 text-xs text-slate-400">
                    Due {formatDate(wo.dueDate)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-600">{wo.title}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <StatusBadge variant={wo.status} label={WO_STATUS_LABELS[wo.status]} />
                <StatusBadge variant={wo.priority} label={WO_PRIORITY_LABELS[wo.priority]} />
                {childCountMap.has(wo.id) && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                    <GitBranch className="h-2.5 w-2.5" />
                    {childCountMap.get(wo.id)} sub-WO{(childCountMap.get(wo.id) ?? 0) > 1 ? "s" : ""}
                  </span>
                )}
                {wo.parentWorkOrderId && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    Sub-WO
                  </span>
                )}
              </div>
              {/* Assignee badges */}
              {wo.assignedToNames.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {wo.assignedToNames.map((name, i) => (
                    <span
                      key={wo.assignedToIds[i] ?? i}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-300 text-[8px] font-bold text-white">
                        {getInitials(name)}
                      </span>
                      {name.split(" ")[0]}
                    </span>
                  ))}
                </div>
              )}
              {(wo.categories?.length > 0 || wo.category) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(wo.categories?.length > 0 ? wo.categories : (wo.category ? [wo.category] : [])).map((catId) => (
                    <span key={catId} className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {(woCategories ?? []).find((c) => c.id === catId)?.label ?? catId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
