"use client";

import { useState, useEffect, useRef } from "react";
import { GripVertical, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { useApprovalFlows, useUpdateApprovalFlow, useCreateApprovalFlow } from "@/lib/hooks/use-approval-flows";
import { useUsers } from "@/lib/hooks/use-users";
import { useRoles } from "@/lib/hooks/use-roles";
import { useEmployees } from "@/lib/hooks/use-employees";
import type { ApprovalFlow, ApprovalFlowStep, ApprovalRequiredRole, Role } from "@/types";

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
  requiredRole: ApprovalRequiredRole;
  label: string;
  thresholdCents: number;
  assignedUserId: string | null;
}

function EditStepForm({
  step,
  isCrmEstimate,
  onSave,
  onCancel,
}: {
  step: Partial<ApprovalFlowStep>;
  isCrmEstimate: boolean;
  onSave: (s: StepDraft) => void;
  onCancel: () => void;
}) {
  const { data: allUsers = [] } = useUsers();
  const { data: crmRoles = [] } = useRoles(true);
  const { data: employees = [] } = useEmployees();
  const [role, setRole] = useState<ApprovalRequiredRole>(
    step.requiredRole ?? (isCrmEstimate ? crmRoles[0]?.id ?? "" : "manager")
  );
  const [label, setLabel] = useState(step.label ?? "");
  const [threshold, setThreshold] = useState(
    step.thresholdCents != null ? String(step.thresholdCents / 100) : "0"
  );
  const [assignedUserId, setAssignedUserId] = useState<string>(
    step.assignedUserId ?? "anyone"
  );

  const thresholdCents = Math.round(parseFloat(threshold || "0") * 100);

  // crmRoles loads async — if this is a new step opened before the list arrived,
  // backfill the default selection once roles are available.
  useEffect(() => {
    if (isCrmEstimate && !step.requiredRole && !role && crmRoles.length > 0) {
      setRole(crmRoles[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmRoles]);

  // CRM steps assign employees (filtered by crm_role, resolved to their linked login);
  // PO/CMMS steps assign profiles directly, filtered by the generic Role.
  const employeesWithRole = isCrmEstimate
    ? employees.filter((e) => e.crmRoleId === role && e.userId)
    : [];
  const usersWithRole = isCrmEstimate
    ? employeesWithRole.map((e) => ({ id: e.userId as string, name: `${e.firstName} ${e.lastName}` }))
    : allUsers.filter((u) => u.role === role);
  const roleLabel = isCrmEstimate
    ? crmRoles.find((r) => r.id === role)?.name ?? "role"
    : role;

  // Reset assigned user when role changes if the previously assigned user no longer fits
  function handleRoleChange(newRole: ApprovalRequiredRole) {
    setRole(newRole);
    const stillValid = usersForRole(newRole).some((u) => u.id === assignedUserId);
    if (!stillValid) setAssignedUserId("anyone");
  }

  function usersForRole(r: ApprovalRequiredRole) {
    return isCrmEstimate
      ? employees.filter((e) => e.crmRoleId === r && e.userId).map((e) => ({ id: e.userId as string }))
      : allUsers.filter((u) => u.role === r);
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
          <Select value={role} onValueChange={handleRoleChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {isCrmEstimate
                ? crmRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))
                : ROLE_OPTIONS.map((r) => (
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
                Any {roleLabel} (all notified, first to decide wins)
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
                ? `All ${usersWithRole.length} people with the ${roleLabel} role will be notified. The first to approve or reject resolves this step.`
                : usersWithRole.length === 1
                  ? `The single ${roleLabel} on your team will receive this request.`
                  : `No one currently has the ${roleLabel} role — this step will have no approver until someone is assigned that role.`
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

function SortableStepRow({
  step,
  index,
  roleColorClass,
  roleLabel,
  assignedName,
  peopleCount,
  onEdit,
  onDelete,
}: {
  step: ApprovalFlowStep;
  index: number;
  roleColorClass: string;
  roleLabel: string;
  assignedName: string | null;
  peopleCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 md:gap-3 ${
        isDragging ? "z-10 opacity-90 shadow-md" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="hidden shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing md:block"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Order badge */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
        {index + 1}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{step.label}</span>
          <Badge variant="outline" className={`text-[10px] ${roleColorClass}`}>
            {roleLabel}
          </Badge>
        </div>
        <span className="text-xs text-slate-400">
          {assignedName
            ? `Assigned to ${assignedName}`
            : `Any ${roleLabel} (${peopleCount} on team)`}
          {" · "}
          {formatThreshold(step.thresholdCents)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-400 hover:text-slate-700"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-400 hover:text-red-500"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FlowCard({ flow }: { flow: ApprovalFlow }) {
  const isCrmEstimate = flow.entityType === "crm_estimate";
  const { data: allUsers = [] } = useUsers();
  const { data: crmRoles = [] } = useRoles(true);
  const { data: employees = [] } = useEmployees();
  const { mutate: saveFlow, isPending: saving, isError: saveError } = useUpdateApprovalFlow();
  const [steps, setSteps] = useState<ApprovalFlowStep[]>(flow.steps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saveFlowRef = useRef(saveFlow);
  saveFlowRef.current = saveFlow;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Auto-save 400ms after any step change
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      saveFlowRef.current({ flowId: flow.id, steps: stepsRef.current }, { onSuccess: () => setDirty(false) });
    }, 400);
    return () => clearTimeout(timer);
  }, [steps, dirty, flow.id]);

  // Flush any pending save when navigating away
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        saveFlowRef.current({ flowId: flow.id, steps: stepsRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, order: i + 1 }));
    });
    setDirty(true);
  }

  function roleLabelFor(requiredRole: ApprovalFlowStep["requiredRole"]) {
    return isCrmEstimate
      ? crmRoles.find((r) => r.id === requiredRole)?.name ?? "Unknown role"
      : requiredRole;
  }

  function peopleWithRoleCount(requiredRole: ApprovalFlowStep["requiredRole"]) {
    return isCrmEstimate
      ? employees.filter((e) => e.crmRoleId === requiredRole && e.userId).length
      : allUsers.filter((u) => u.role === requiredRole).length;
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

      {saveError && (
        <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
          Failed to save approval flow. Please try again.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {steps.map((step, i) => (
              <div key={step.id}>
                {editingId === step.id ? (
                  <EditStepForm
                    step={step}
                    isCrmEstimate={isCrmEstimate}
                    onSave={handleSaveStep}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SortableStepRow
                    step={step}
                    index={i}
                    roleColorClass={isCrmEstimate ? "" : ROLE_COLORS[step.requiredRole] ?? ""}
                    roleLabel={roleLabelFor(step.requiredRole)}
                    assignedName={
                      step.assignedUserId
                        ? allUsers.find((u) => u.id === step.assignedUserId)?.name ?? "Unknown"
                        : null
                    }
                    peopleCount={peopleWithRoleCount(step.requiredRole)}
                    onEdit={() => setEditingId(step.id)}
                    onDelete={() => handleDelete(step.id)}
                  />
                )}

                {/* Connector arrow */}
                {i < steps.length - 1 && !addingNew && (
                  <div className="flex justify-center py-1">
                    <div className="h-4 w-0.5 bg-slate-200" />
                  </div>
                )}
              </div>
            ))}
          </SortableContext>
        </DndContext>

        {addingNew ? (
          <EditStepForm
            step={{ order: steps.length + 1 }}
            isCrmEstimate={isCrmEstimate}
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

const DEFAULT_FLOWS: { name: string; entityType: ApprovalFlow["entityType"] }[] = [
  { name: "Requisition Approval", entityType: "requisition" },
  { name: "Purchase Order Approval", entityType: "purchase_order" },
  { name: "Estimate Approval", entityType: "crm_estimate" },
];

const ENTITY_LABELS: Record<ApprovalFlow["entityType"], string> = {
  requisition: "requisitions",
  purchase_order: "purchase orders",
  crm_estimate: "estimates",
};

const ALL_ENTITY_TYPES: ApprovalFlow["entityType"][] = ["requisition", "purchase_order", "crm_estimate"];

interface ApprovalFlowsPageProps {
  /** Restrict this instance to a subset of entity types (e.g. just crm_estimate when
   *  embedded in CRM settings). Defaults to all three. */
  entityTypes?: ApprovalFlow["entityType"][];
}

export function ApprovalFlowsPage({ entityTypes = ALL_ENTITY_TYPES }: ApprovalFlowsPageProps = {}) {
  const { data: flows, isLoading } = useApprovalFlows();
  const { mutate: createFlow, isPending: creating } = useCreateApprovalFlow();
  const displayFlows = (flows ?? []).filter((f) => entityTypes.includes(f.entityType));
  const relevantDefaults = DEFAULT_FLOWS.filter((d) => entityTypes.includes(d.entityType));
  const scopeLabel = entityTypes.map((t) => ENTITY_LABELS[t]).join(" and ");

  function handleInitialize() {
    relevantDefaults.forEach(({ name, entityType }) => {
      const alreadyExists = displayFlows.some((f) => f.entityType === entityType);
      if (!alreadyExists) {
        createFlow({ name, entityType });
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Approval Flows</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure the approval chain for {scopeLabel}. Each step
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
      ) : displayFlows.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No approval flows configured</p>
          <p className="max-w-sm text-xs text-slate-500">
            Click below to create the default {scopeLabel} approval flow{relevantDefaults.length > 1 ? "s" : ""},
            then add approval steps to each one.
          </p>
          <Button size="sm" onClick={handleInitialize} disabled={creating}>
            {creating ? "Creating…" : "Initialize Default Flows"}
          </Button>
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
