"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AutomationRule,
  TriggerType,
  ActionType,
} from "@/types/automation";
import { useMeters } from "@/lib/hooks/use-meters";

interface AutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: AutomationRule | null;
  onSave: (rule: AutomationRule) => void;
}

export function AutomationDialog({
  open,
  onOpenChange,
  initialData,
  onSave,
}: AutomationDialogProps) {
  const isEdit = initialData != null;
  const title = isEdit ? "Edit Automation" : "New Automation";
  const submitLabel = isEdit ? "Save Changes" : "Create Automation";

  // Core fields
  const [name, setName] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  // Trigger type + config
  const [triggerType, setTriggerType] = useState<TriggerType>("part_low_stock");
  const [meterId, setMeterId] = useState("");
  const [meterLabel, setMeterLabel] = useState("");
  const [meterOperator, setMeterOperator] = useState<">=" | "<=">(">=");
  const [meterValue, setMeterValue] = useState("");
  const [partName, setPartName] = useState("any");
  const [pmDaysAhead, setPmDaysAhead] = useState("7");
  const [woDaysOverdue, setWoDaysOverdue] = useState("1");
  const [woTargetStatus, setWoTargetStatus] = useState<"open" | "in_progress" | "on_hold" | "done">("open");
  const [poTargetStatus, setPoTargetStatus] = useState<"draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "closed">("approved");

  const { data: meters = [] } = useMeters();

  // Action type + config
  const [actionType, setActionType] = useState<ActionType>("send_notification");
  const [woTitle, setWoTitle] = useState("");
  const [woPriority, setWoPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [woAssignedTo, setWoAssignedTo] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [notifRole, setNotifRole] = useState<"admin" | "manager" | "technician" | "purchaser" | "all">("manager");
  const [notifMessage, setNotifMessage] = useState("");
  const [emailRecipient, setEmailRecipient] = useState("");

  // Seed state from initialData when dialog opens
  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      // Reset to defaults for new automation
      setName("");
      setIsEnabled(true);
      setTriggerType("part_low_stock");
      setMeterId("");
      setMeterLabel("");
      setMeterOperator(">=");
      setMeterValue("");
      setPartName("any");
      setPmDaysAhead("7");
      setWoDaysOverdue("1");
      setWoTargetStatus("open");
      setPoTargetStatus("approved");
      setActionType("send_notification");
      setWoTitle("");
      setWoPriority("medium");
      setWoAssignedTo("");
      setReqNotes("");
      setNotifRole("manager");
      setNotifMessage("");
      setEmailRecipient("");
      return;
    }

    setName(initialData.name);
    setIsEnabled(initialData.isEnabled);

    // Seed trigger fields
    const t = initialData.trigger;
    setTriggerType(t.type);
    switch (t.type) {
      case "meter_threshold":
        setMeterId(t.meterId);
        setMeterLabel(t.meterLabel);
        setMeterOperator(t.operator);
        setMeterValue(String(t.value));
        break;
      case "part_low_stock":
        setPartName(t.partName);
        break;
      case "pm_due":
        setPmDaysAhead(String(t.daysAhead));
        break;
      case "wo_overdue":
        setWoDaysOverdue(String(t.daysOverdue));
        break;
      case "request_submitted":
        break;
      case "wo_status_change":
        setWoTargetStatus(t.toStatus);
        break;
      case "po_status_change":
        setPoTargetStatus(t.toStatus);
        break;
    }

    // Seed action fields
    const a = initialData.action;
    setActionType(a.type);
    switch (a.type) {
      case "create_wo_request":
        setWoTitle(a.title);
        setWoPriority(a.priority);
        setWoAssignedTo(a.assignedTo);
        break;
      case "create_requisition":
        setReqNotes(a.notes);
        break;
      case "send_notification":
        setNotifRole(a.recipientRole);
        setNotifMessage(a.message);
        break;
      case "send_email":
        setEmailRecipient(a.recipient);
        break;
    }
  }, [open, initialData]);

  // Reset trigger config when trigger type changes
  function handleTriggerTypeChange(value: TriggerType) {
    setTriggerType(value);
    setMeterId("");
    setMeterLabel("");
    setMeterOperator(">=");
    setMeterValue("");
    setPartName("any");
    setPmDaysAhead("7");
    setWoDaysOverdue("1");
    setWoTargetStatus("open");
    setPoTargetStatus("approved");
  }

  // Reset action config when action type changes
  function handleActionTypeChange(value: ActionType) {
    setActionType(value);
    setWoTitle("");
    setWoPriority("medium");
    setWoAssignedTo("");
    setReqNotes("");
    setNotifRole("manager");
    setNotifMessage("");
    setEmailRecipient("");
  }

  function buildTrigger(): AutomationRule["trigger"] {
    switch (triggerType) {
      case "meter_threshold":
        return { type: "meter_threshold", meterId, meterLabel, operator: meterOperator, value: Number(meterValue) };
      case "part_low_stock":
        return { type: "part_low_stock", partName };
      case "pm_due":
        return { type: "pm_due", daysAhead: Number(pmDaysAhead) };
      case "wo_overdue":
        return { type: "wo_overdue", daysOverdue: Number(woDaysOverdue) };
      case "request_submitted":
        return { type: "request_submitted" };
      case "wo_status_change":
        return { type: "wo_status_change", toStatus: woTargetStatus };
      case "po_status_change":
        return { type: "po_status_change", toStatus: poTargetStatus };
    }
  }

  function buildAction(): AutomationRule["action"] {
    switch (actionType) {
      case "create_wo_request":
        return { type: "create_wo_request", title: woTitle, priority: woPriority, assignedTo: woAssignedTo };
      case "create_requisition":
        return { type: "create_requisition", notes: reqNotes };
      case "send_notification":
        return { type: "send_notification", recipientRole: notifRole, message: notifMessage };
      case "send_email":
        return { type: "send_email", recipient: emailRecipient };
    }
  }

  function isValid(): boolean {
    if (!name.trim()) return false;

    // Trigger validation
    switch (triggerType) {
      case "meter_threshold":
        if (!meterId || !meterValue.trim()) return false;
        break;
      case "part_low_stock":
        if (!partName.trim()) return false;
        break;
    }

    // Action validation
    switch (actionType) {
      case "create_wo_request":
        if (!woTitle.trim()) return false;
        break;
      case "send_notification":
        if (!notifMessage.trim()) return false;
        break;
      case "send_email":
        if (!emailRecipient.trim()) return false;
        break;
    }

    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid()) return;

    const rule: AutomationRule = {
      id: initialData?.id ?? `auto-${Date.now()}`,
      name: name.trim(),
      trigger: buildTrigger(),
      action: buildAction(),
      isEnabled,
    };

    onSave(rule);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[80vh] overflow-y-auto flex flex-col gap-5 px-1">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="automation-name">Name</Label>
              <Input
                id="automation-name"
                placeholder="e.g. Low Stock Alert"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Trigger section */}
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">
                Trigger{" "}
                <span className="font-normal text-slate-500">— when does this fire?</span>
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trigger-type">Trigger Type</Label>
                <Select
                  value={triggerType}
                  onValueChange={(v) => handleTriggerTypeChange(v as TriggerType)}
                >
                  <SelectTrigger id="trigger-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meter_threshold">Meter Threshold</SelectItem>
                    <SelectItem value="part_low_stock">Part Low Stock</SelectItem>
                    <SelectItem value="pm_due">PM Due</SelectItem>
                    <SelectItem value="wo_overdue">Work Order Overdue</SelectItem>
                    <SelectItem value="request_submitted">Request Submitted</SelectItem>
                    <SelectItem value="wo_status_change">WO Status Change</SelectItem>
                    <SelectItem value="po_status_change">PO Status Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Trigger config fields */}
              {triggerType === "meter_threshold" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="meter-select">Meter</Label>
                    <Select
                      value={meterId}
                      onValueChange={(v) => {
                        const m = meters.find((m) => m.id === v);
                        if (m) {
                          setMeterId(m.id);
                          setMeterLabel(`${m.name} — ${m.assetName}`);
                        }
                      }}
                    >
                      <SelectTrigger id="meter-select">
                        <SelectValue placeholder="Select a meter" />
                      </SelectTrigger>
                      <SelectContent>
                        {meters.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} — {m.assetName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="meter-operator">Operator</Label>
                      <Select
                        value={meterOperator}
                        onValueChange={(v) => setMeterOperator(v as ">=" | "<=")}
                      >
                        <SelectTrigger id="meter-operator">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value=">=">≥ (greater than or equal)</SelectItem>
                          <SelectItem value="<=">≤ (less than or equal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="meter-value">Threshold Value</Label>
                      <Input
                        id="meter-value"
                        type="number"
                        placeholder="e.g. 5000"
                        value={meterValue}
                        onChange={(e) => setMeterValue(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {triggerType === "part_low_stock" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="part-name">Part Name</Label>
                  <Input
                    id="part-name"
                    placeholder="Type a part name, or enter 'any' for all parts"
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                  />
                </div>
              )}

              {triggerType === "pm_due" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pm-days-ahead">Days Before Due</Label>
                  <Input
                    id="pm-days-ahead"
                    type="number"
                    min="1"
                    value={pmDaysAhead}
                    onChange={(e) => setPmDaysAhead(e.target.value)}
                  />
                </div>
              )}

              {triggerType === "wo_overdue" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wo-days-overdue">Days Overdue</Label>
                  <Input
                    id="wo-days-overdue"
                    type="number"
                    min="1"
                    value={woDaysOverdue}
                    onChange={(e) => setWoDaysOverdue(e.target.value)}
                  />
                </div>
              )}

              {triggerType === "request_submitted" && (
                <p className="text-xs text-slate-500">
                  Fires whenever a new maintenance request is submitted.
                </p>
              )}

              {triggerType === "wo_status_change" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wo-target-status">Target Status</Label>
                  <Select
                    value={woTargetStatus}
                    onValueChange={(v) =>
                      setWoTargetStatus(v as "open" | "in_progress" | "on_hold" | "done")
                    }
                  >
                    <SelectTrigger id="wo-target-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {triggerType === "po_status_change" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="po-target-status">Target Status</Label>
                  <Select
                    value={poTargetStatus}
                    onValueChange={(v) =>
                      setPoTargetStatus(v as "draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "closed")
                    }
                  >
                    <SelectTrigger id="po-target-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Action section */}
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">
                Action{" "}
                <span className="font-normal text-slate-500">— what happens?</span>
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="action-type">Action Type</Label>
                <Select
                  value={actionType}
                  onValueChange={(v) => handleActionTypeChange(v as ActionType)}
                >
                  <SelectTrigger id="action-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_wo_request">Create WO Request</SelectItem>
                    <SelectItem value="create_requisition">Create Requisition</SelectItem>
                    <SelectItem value="send_notification">Send Notification</SelectItem>
                    <SelectItem value="send_email">Send Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action config fields */}
              {actionType === "create_wo_request" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wo-title">Request Title</Label>
                    <Input
                      id="wo-title"
                      placeholder="e.g. PM Service Due"
                      value={woTitle}
                      onChange={(e) => setWoTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wo-priority">Priority</Label>
                    <Select
                      value={woPriority}
                      onValueChange={(v) =>
                        setWoPriority(v as "low" | "medium" | "high" | "urgent")
                      }
                    >
                      <SelectTrigger id="wo-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wo-assigned-to">
                      Assigned To{" "}
                      <span className="font-normal text-slate-500">(optional)</span>
                    </Label>
                    <Input
                      id="wo-assigned-to"
                      placeholder="e.g. Casey Kleinman"
                      value={woAssignedTo}
                      onChange={(e) => setWoAssignedTo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {actionType === "create_requisition" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-notes">
                    Notes{" "}
                    <span className="font-normal text-slate-500">(optional)</span>
                  </Label>
                  <Textarea
                    id="req-notes"
                    placeholder="e.g. Auto-generated from low stock alert"
                    value={reqNotes}
                    onChange={(e) => setReqNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              )}

              {actionType === "send_notification" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notif-role">Recipient Role</Label>
                    <Select
                      value={notifRole}
                      onValueChange={(v) =>
                        setNotifRole(v as "admin" | "manager" | "technician" | "purchaser" | "all")
                      }
                    >
                      <SelectTrigger id="notif-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="technician">Technician</SelectItem>
                        <SelectItem value="purchaser">Purchaser</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notif-message">Message</Label>
                    <Textarea
                      id="notif-message"
                      placeholder="e.g. A work order is past its due date and needs attention."
                      value={notifMessage}
                      onChange={(e) => setNotifMessage(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {actionType === "send_email" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-recipient">Recipient (name or email)</Label>
                  <Input
                    id="email-recipient"
                    placeholder="e.g. manager@example.com"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="automation-enabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
              />
              <Label htmlFor="automation-enabled" className="cursor-pointer">
                {isEnabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
          </div>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
