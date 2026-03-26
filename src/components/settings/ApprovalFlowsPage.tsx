"use client";

import { useState } from "react";
import { GripVertical, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useApprovalFlows, useUpdateApprovalFlow } from "@/lib/hooks/use-approval-flows";
import { useUsers } from "@/lib/hooks/use-users";
import type { ApprovalFlow, ApprovalFlowStep, Role } from "@/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "purchaser", label: "Purchaser" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  manager: "bg-blue-100 text-blue-700 border-blue-200",
  purchaser: "bg-amber-100 text-amber-700 border-amber-200",
};

function formatThreshold(cents: number) {
  if (cents === 0) return "Always required";
  return `Required for amounts ≥ $${(cents / 100).toLocaleString()}`;
}

interface StepDraft {
  requiredRole: Role;
  label: string;
  thresholdCents: number;
  assignedUserId: string | null;
}

function EditStepForm({
  step,
  onSave,
  onCancel,
}: {
  step: Partial<ApprovalFlowStep>;
  onSave: (s: StepDraft) => void;
  onCancel: () => void;
}) {
  const { data: allUsers = [] } = useUsers();
  const [role, setRole] = useState<Role>(step.requiredRole ?? "manager");
  const [label, setLabel] = useState(step.label ?? "");
  const [threshold, setThreshold] = useState(
    step.thresholdCents != null ? String(step.thresholdCents / 100) : "0"
  );
  const [assignedUserId, setAssignedUserId] = useState<string>(
    step.assignedUserId ?? "anyone"
  );

  const thresholdCents = Math.round(parseFloat(threshold || "0") * 100);
  const usersWithRole = allUsers.filter((u) => u.role === role);

  // Reset assigned user when role changes if the previously assigned user no longer fits
  function handleRoleChange(newRole: Role) {
    setRole(newRole);
    const stillValid = allUsers.some((u) => u.id === assignedUserId && u.role === newRole);
    if (!stillValid) setAssignedUserId("anyone");
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
        {step.id ? "Edit Step" : "New Step"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Manager Approval"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Required Role</label>
          <Select value={role} onValueChange={(v) => handleRoleChange(v as Role)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Assign To</label>
          <Select value={assignedUserId} onValueChange={setAssignedUserId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anyone">
                Any {role} (all notified, first to decide wins)
              </SelectItem>
              {usersWithRole.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-400">
            {assignedUserId === "anyone"
              ? usersWithRole.length > 1
                ? `All ${usersWithRole.length} ${role}s will be notified. The first to approve or reject resolves this step.`
                : `The single ${role} on your team will receive this request.`
              : `Only ${allUsers.find((u) => u.id === assignedUserId)?.name ?? "Unknown"} will receive this request.`}
          </p>
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">
            Dollar Threshold ($) — enter 0 to always require this step
          </label>
          <div className="relative w-48">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <Input
              type="number"
              min={0}
              step={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="h-8 pl-6 text-sm"
            />
          </div>
          <p className="text-xs text-slate-400">
            {thresholdCents === 0
              ? "This step will always be required."
              : `This step will only trigger for requests totaling $${(thresholdCents / 100).toLocaleString()} or more.`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!label.trim()}
          onClick={() =>
            onSave({
              requiredRole: role,
              label: label.trim(),
              thresholdCents,
              assignedUserId: assignedUserId === "anyone" ? null : assignedUserId,
            })
          }
        >
          <Save className="h-3 w-3" />
          Save Step
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          <X className="h-3 w-3" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function FlowCard({ flow }: { flow: ApprovalFlow }) {
  const { data: allUsers = [] } = useUsers();
  const { mutate: saveFlow, isPending: saving } = useUpdateApprovalFlow();
  const [steps, setSteps] = useState<ApprovalFlowStep[]>(flow.steps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [dirty, setDirty] = useState(false);

  function handleSaveStep(updated: StepDraft) {
    if (editingId) {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                requiredRole: updated.requiredRole,
                label: updated.label,
                thresholdCents: updated.thresholdCents,
                assignedUserId: updated.assignedUserId,
              }
            : s
        )
      );
      setEditingId(null);
    } else {
      const newStep: ApprovalFlowStep = {
        id: `step-${Date.now()}`,
        order: steps.length + 1,
        requiredRole: updated.requiredRole,
        label: updated.label,
        thresholdCents: updated.thresholdCents,
        assignedUserId: updated.assignedUserId,
      };
      setSteps((prev) => [...prev, newStep]);
      setAddingNew(false);
    }
    setDirty(true);
  }

  function handleDelete(id: string) {
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i + 1 }))
    );
    setDirty(true);
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{flow.name}</h3>
          <p className="mt-0.5 text-xs text-slate-400 capitalize">
            Applies to: {flow.entityType.replace("_", " ")}s
          </p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={saving}
            onClick={() =>
              saveFlow(
                { flowId: flow.id, steps },
                { onSuccess: () => setDirty(false) }
              )
            }
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div key={step.id}>
            {editingId === step.id ? (
              <EditStepForm
                step={step}
                onSave={handleSaveStep}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />

                {/* Order badge */}
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                  {i + 1}
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{step.label}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${ROLE_COLORS[step.requiredRole] ?? ""}`}
                    >
                      {step.requiredRole}
                    </Badge>
                  </div>
                  <span className="text-xs text-slate-400">
                    {step.assignedUserId
                      ? `Assigned to ${allUsers.find((u) => u.id === step.assignedUserId)?.name ?? "Unknown"}`
                      : `Any ${step.requiredRole} (${allUsers.filter((u) => u.role === step.requiredRole).length} on team)`}
                    {" · "}
                    {formatThreshold(step.thresholdCents)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-400 hover:text-slate-700"
                    onClick={() => setEditingId(step.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-400 hover:text-red-500"
                    onClick={() => handleDelete(step.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Connector arrow */}
            {i < steps.length - 1 && !addingNew && (
              <div className="flex justify-center py-1">
                <div className="h-4 w-0.5 bg-slate-200" />
              </div>
            )}
          </div>
        ))}

        {addingNew ? (
          <EditStepForm
            step={{ order: steps.length + 1 }}
            onSave={handleSaveStep}
            onCancel={() => setAddingNew(false)}
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-8 gap-1.5 border-dashed text-xs"
            onClick={() => setAddingNew(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Approval Step
          </Button>
        )}
      </div>
    </div>
  );
}

export function ApprovalFlowsPage() {
  const { data: flows, isLoading } = useApprovalFlows();
  const displayFlows = flows ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Approval Flows</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure the approval chain for requisitions and purchase orders. Each step
          specifies which role must approve and an optional dollar threshold above which
          the step activates.
        </p>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {displayFlows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
        <p className="font-medium text-slate-700">How thresholds work</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>A step with a <strong>$0 threshold</strong> is always required, regardless of amount.</li>
          <li>A step with a <strong>dollar threshold</strong> (e.g. $2,500) only activates when the request total meets or exceeds that amount. Otherwise it is automatically skipped.</li>
          <li>Steps are processed in order — the next step only opens once the previous one is approved.</li>
        </ul>
      </div>
    </div>
  );
}
