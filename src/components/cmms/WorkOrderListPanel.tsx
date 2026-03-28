"use client";

import { cn, formatDate, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { useUsers } from "@/lib/hooks/use-users";
import { useUpdateWorkOrder } from "@/lib/hooks/use-work-orders";
import { useSettingsStore } from "@/stores";
import type { WorkOrder } from "@/types";

interface WorkOrderListPanelProps {
  workOrders: WorkOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function WorkOrderListPanel({ workOrders, selectedId, onSelect }: WorkOrderListPanelProps) {
  const { data: users = [] } = useUsers();
  const { mutate: updateWO } = useUpdateWorkOrder();
  const { woCategories } = useSettingsStore();

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
              </div>
              <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {/* Assignee */}
                <Select
                  value={wo.assignedToId ?? "unassigned"}
                  onValueChange={(val) => {
                    const user = users.find((u) => u.id === val);
                    updateWO({
                      id: wo.id,
                      assignedToId: val === "unassigned" ? null : val,
                      assignedToName: user?.name ?? null,
                    });
                  }}
                >
                  <SelectTrigger className="h-6 w-[120px] text-[11px] px-2">
                    <SelectValue placeholder="Assign..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Category */}
                <Select
                  value={wo.category ?? "none"}
                  onValueChange={(val) => {
                    updateWO({
                      id: wo.id,
                      category: val === "none" ? null : val,
                    });
                  }}
                >
                  <SelectTrigger className="h-6 w-[100px] text-[11px] px-2">
                    <SelectValue placeholder="Category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {(woCategories ?? []).filter((c) => c.enabled).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
