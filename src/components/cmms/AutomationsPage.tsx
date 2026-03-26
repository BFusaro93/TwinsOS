"use client";

import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { EditButton } from "@/components/shared/EditButton";
import { AutomationDialog } from "./AutomationDialog";
import type { AutomationRule, AutomationTrigger, AutomationAction } from "@/types/automation";

export type { AutomationRule };

export function formatTrigger(trigger: AutomationTrigger): string {
  switch (trigger.type) {
    case "meter_threshold":
      return `${trigger.meterLabel} ${trigger.operator} ${trigger.value.toLocaleString()}`;
    case "part_low_stock":
      return trigger.partName === "any"
        ? "Any part drops below minimum stock"
        : `"${trigger.partName}" drops below minimum stock`;
    case "pm_due":
      return `PM schedule due within ${trigger.daysAhead} days`;
    case "wo_overdue":
      return `Work order overdue by ${trigger.daysOverdue}+ days`;
    case "request_submitted":
      return "New maintenance request submitted";
    case "wo_status_change":
      return `Work order status changes to "${trigger.toStatus.replace("_", " ")}"`;
    case "po_status_change": {
      const label: Record<string, string> = {
        draft: "Draft",
        pending_approval: "Pending Approval",
        approved: "Approved",
        rejected: "Rejected",
        ordered: "Ordered",
        closed: "Closed",
      };
      return `Purchase order status changes to "${label[trigger.toStatus] ?? trigger.toStatus}"`;
    }
  }
}

export function formatAction(action: AutomationAction): string {
  switch (action.type) {
    case "create_wo_request":
      return `Create work order: "${action.title}" — ${action.priority} priority${action.assignedTo ? ` → ${action.assignedTo}` : ""}`;
    case "create_requisition":
      return `Create purchase requisition${action.notes ? `: ${action.notes}` : ""}`;
    case "send_notification":
      return `Notify ${action.recipientRole}: "${action.message}"`;
    case "send_email":
      return `Send email to ${action.recipient}`;
  }
}

const INITIAL_RULES: AutomationRule[] = [
  {
    id: "auto-001",
    name: "Low Stock Alert",
    trigger: { type: "part_low_stock", partName: "any" },
    action: { type: "create_requisition", notes: "Auto-generated from low stock alert" },
    isEnabled: true,
  },
  {
    id: "auto-002",
    name: "PM Due Reminder",
    trigger: { type: "pm_due", daysAhead: 7 },
    action: { type: "create_wo_request", title: "PM Service Due", priority: "medium", assignedTo: "Casey Kleinman" },
    isEnabled: true,
  },
  {
    id: "auto-003",
    name: "Work Order Overdue",
    trigger: { type: "wo_overdue", daysOverdue: 1 },
    action: { type: "send_notification", recipientRole: "manager", message: "A work order is past its due date and needs attention." },
    isEnabled: true,
  },
  {
    id: "auto-004",
    name: "Request Auto-Assign",
    trigger: { type: "request_submitted" },
    action: { type: "send_notification", recipientRole: "manager", message: "New maintenance request submitted and awaiting review." },
    isEnabled: false,
  },
  {
    id: "auto-005",
    name: "Vehicle Mileage Service",
    trigger: { type: "meter_threshold", meterId: "meter-001", meterLabel: "Odometer — 2022 Ford F-350 #12", operator: ">=", value: 50000 },
    action: { type: "create_wo_request", title: "Oil Change – 5,000 mi interval", priority: "medium", assignedTo: "Casey Kleinman" },
    isEnabled: true,
  },
];

export function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>(INITIAL_RULES);
  const [newOpen, setNewOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const enabledCount = rules.filter((r) => r.isEnabled).length;

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r))
    );
  }

  function handleSaveNew(rule: AutomationRule) {
    setRules((prev) => [...prev, rule]);
  }

  function handleSaveEdit(rule: AutomationRule) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
    setEditingRule(null);
  }

  function handleDelete(id: string) {
    if (window.confirm("Delete this automation?")) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  }

  const newAutomationButton = (
    <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
      <Plus className="h-4 w-4" />
      New Automation
    </Button>
  );

  if (rules.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Automations"
          description="Rule-based workflow automations"
          action={newAutomationButton}
        />
        <EmptyState
          icon={Zap}
          title="No automations configured"
          description="Automations will automatically trigger actions based on conditions in your data."
        />
        <AutomationDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          onSave={handleSaveNew}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Automations"
        description="Rule-based workflow automations"
        action={newAutomationButton}
      />

      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Zap className="h-4 w-4 text-brand-500" />
        <span>
          <span className="font-medium text-slate-900">{enabledCount}</span> of{" "}
          {rules.length} automations enabled
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Name</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell className="text-slate-600">{formatTrigger(rule.trigger)}</TableCell>
                <TableCell className="text-slate-600">{formatAction(rule.action)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.isEnabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                      aria-label={`Toggle ${rule.name}`}
                    />
                    {rule.isEnabled ? (
                      <Badge
                        variant="outline"
                        className="border-green-200 bg-green-50 text-green-700"
                      >
                        Enabled
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-100 text-slate-500"
                      >
                        Disabled
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <EditButton onClick={() => setEditingRule(rule)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => handleDelete(rule.id)}
                      aria-label={`Delete ${rule.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AutomationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSave={handleSaveNew}
      />

      <AutomationDialog
        open={editingRule != null}
        onOpenChange={(open) => {
          if (!open) setEditingRule(null);
        }}
        initialData={editingRule}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
