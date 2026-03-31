"use client";

import { useState } from "react";
import { Plus, Trash2, Zap, Sparkles } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { EditButton } from "@/components/shared/EditButton";
import { AutomationDialog } from "./AutomationDialog";
import type { AutomationRule, AutomationTrigger, AutomationAction } from "@/types/automation";
import {
  useAutomations,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
} from "@/lib/hooks/use-automations";

// ── Pre-built templates ───────────────────────────────────────────────────────

interface AutomationTemplate {
  name: string;
  description: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
}

const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    name: "Low Stock Alert",
    description: "Creates a purchase requisition whenever any part drops below its minimum stock level.",
    trigger: { type: "part_low_stock", partName: "any" },
    action: { type: "create_requisition", notes: "Auto-generated from low stock alert" },
  },
  {
    name: "PM Due Reminder",
    description: "Creates a work order 7 days before any PM schedule comes due.",
    trigger: { type: "pm_due", daysAhead: 7 },
    action: { type: "create_wo_request", title: "PM Service Due", priority: "medium", assignedTo: "" },
  },
  {
    name: "Work Order Overdue",
    description: "Notifies the manager as soon as any work order passes its due date.",
    trigger: { type: "wo_overdue", daysOverdue: 1 },
    action: { type: "send_notification", recipientRole: "manager", message: "A work order is past its due date and needs attention." },
  },
  {
    name: "New Request Submitted",
    description: "Notifies the manager whenever a new maintenance request is submitted.",
    trigger: { type: "request_submitted" },
    action: { type: "send_notification", recipientRole: "manager", message: "New maintenance request submitted and awaiting review." },
  },
  {
    name: "WO Completed — Notify Requester",
    description: "Notifies all users when a work order is marked done.",
    trigger: { type: "wo_status_change", toStatus: "done" },
    action: { type: "send_notification", recipientRole: "all", message: "A work order has been completed." },
  },
  {
    name: "PO Approved",
    description: "Notifies the purchasing team when a purchase order is approved.",
    trigger: { type: "po_status_change", toStatus: "approved" },
    action: { type: "send_notification", recipientRole: "purchaser", message: "A purchase order has been approved and is ready to be sent to the vendor." },
  },
];

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

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AutomationsPage() {
  const { data: rules = [], isLoading } = useAutomations();
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();
  const [newOpen, setNewOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);

  function handleAddTemplate(template: AutomationTemplate) {
    setAddingTemplate(template.name);
    createAutomation.mutate(
      { name: template.name, enabled: true, trigger: template.trigger, action: template.action },
      { onSettled: () => setAddingTemplate(null) }
    );
  }

  const enabledCount = rules.filter((r) => r.isEnabled).length;

  function toggleRule(id: string, currentEnabled: boolean) {
    updateAutomation.mutate({ id, enabled: !currentEnabled });
  }

  function handleDelete(id: string) {
    if (window.confirm("Delete this automation?")) {
      deleteAutomation.mutate(id);
    }
  }

  const newAutomationButton = (
    <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
      <Plus className="h-4 w-4" />
      New Automation
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Automations"
          description="Rule-based workflow automations"
          action={newAutomationButton}
        />
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const templateSection = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold text-slate-700">Start from a template</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AUTOMATION_TEMPLATES.map((t) => {
          const alreadyAdded = rules.some((r) => r.name === t.name);
          return (
            <div
              key={t.name}
              className="flex flex-col justify-between gap-3 rounded-lg border bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                <p className="mt-1 text-xs text-slate-500">{t.description}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                disabled={alreadyAdded || addingTemplate === t.name}
                onClick={() => handleAddTemplate(t)}
              >
                {alreadyAdded ? "Added" : addingTemplate === t.name ? "Adding..." : "+ Add"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
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
          description="Add one from a template below or create your own."
        />
        {templateSection}
        <AutomationDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          onSave={() => {}}
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
              <TableHead>Last Fired</TableHead>
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
                <TableCell className="text-slate-500 text-sm">{formatDate(rule.lastFiredAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.isEnabled}
                      onCheckedChange={() => toggleRule(rule.id, rule.isEnabled)}
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

      {templateSection}

      <AutomationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSave={() => setNewOpen(false)}
      />

      <AutomationDialog
        open={editingRule != null}
        onOpenChange={(open) => {
          if (!open) setEditingRule(null);
        }}
        initialData={editingRule}
        onSave={() => setEditingRule(null)}
      />
    </div>
  );
}
