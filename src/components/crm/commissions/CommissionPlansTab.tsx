"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/shared/useConfirm";
import {
  useAddCommissionAssignment,
  useCommissionAssignments,
  useCommissionPlans,
  useDeleteCommissionAssignment,
  useDeleteCommissionPlan,
  useDeleteCommissionRule,
  useEndCommissionAssignment,
  useSaveCommissionPlan,
  useSaveCommissionRule,
} from "@/lib/hooks/use-commissions";
import { useEmployees } from "@/lib/hooks/use-employees";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { formatDate } from "@/lib/utils";
import type { CommissionEarnedOn, CommissionPlan, CommissionRule, CommissionSaleType } from "@/types/crm-commissions";
import { EARNED_ON_LABEL, SALE_TYPE_LABEL, formatRate } from "./commission-format";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function PlanDialog({ plan, open, onOpenChange }: { plan: CommissionPlan | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveCommissionPlan();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  async function submit() {
    if (!name.trim()) return toast.error("Give the plan a name");
    try {
      await save.mutateAsync({ id: plan?.id, name, description, isActive: plan?.isActive ?? true });
      onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{plan ? "Edit plan" : "New commission plan"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Outside Sales" /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ALL = "all";

function ruleScopeLabel(r: CommissionRule, serviceName: (id: string) => string) {
  if (r.serviceId) return serviceName(r.serviceId);
  if (r.category) return `${r.category} (category)`;
  return "All services";
}

function AddRuleRow({ planId }: { planId: string }) {
  const save = useSaveCommissionRule();
  const { data: services = [] } = useCRMServices();
  const [scope, setScope] = useState(ALL);
  const [saleType, setSaleType] = useState<CommissionSaleType>("any");
  const [earnedOn, setEarnedOn] = useState<CommissionEarnedOn>("paid");
  const [rate, setRate] = useState("");

  const activeServices = services.filter((s) => s.isActive);
  const categories = [...new Set(activeServices.map((s) => s.category?.trim()).filter((c): c is string => !!c))].sort();

  async function add() {
    const pct = Number.parseFloat(rate);
    if (!(pct >= 0 && pct <= 100)) return toast.error("Enter a rate between 0 and 100%");
    const serviceId = scope.startsWith("svc:") ? scope.slice(4) : null;
    const category = scope.startsWith("cat:") ? scope.slice(4) : null;
    try {
      await save.mutateAsync({ planId, serviceId, category, saleType, earnedOn, rateBps: Math.round(pct * 100) });
      setRate("");
    } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="flex flex-wrap items-end gap-2 pt-2">
      <Select value={scope} onValueChange={setScope}>
        <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All services</SelectItem>
          {categories.map((c) => <SelectItem key={c} value={`cat:${c}`} className="capitalize">Category: {c}</SelectItem>)}
          {activeServices.map((s) => <SelectItem key={s.id} value={`svc:${s.id}`}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={saleType} onValueChange={(v) => setSaleType(v as CommissionSaleType)}>
        <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(SALE_TYPE_LABEL) as CommissionSaleType[]).map((d) => <SelectItem key={d} value={d}>{SALE_TYPE_LABEL[d]}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={earnedOn} onValueChange={(v) => setEarnedOn(v as CommissionEarnedOn)}>
        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(EARNED_ON_LABEL) as CommissionEarnedOn[]).map((d) => <SelectItem key={d} value={d}>{EARNED_ON_LABEL[d]}</SelectItem>)}</SelectContent>
      </Select>
      <Input className="h-8 w-24" type="number" min={0} max={100} step="0.01" placeholder="Rate %" value={rate} onChange={(e) => setRate(e.target.value)} />
      <Button size="sm" variant="outline" onClick={add} disabled={save.isPending}><Plus className="mr-1 h-3.5 w-3.5" /> Add rule</Button>
    </div>
  );
}

export function CommissionPlansTab() {
  const { data: plans = [] } = useCommissionPlans();
  const { data: assignments = [] } = useCommissionAssignments();
  const { data: employees = [] } = useEmployees(true);
  const { today } = useOrgDates();
  const { data: allServices = [] } = useCRMServices();
  const serviceName = (id: string) => allServices.find((s) => s.id === id)?.name ?? "Deleted service";
  const delPlan = useDeleteCommissionPlan();
  const delRule = useDeleteCommissionRule();
  const addAssign = useAddCommissionAssignment();
  const endAssign = useEndCommissionAssignment();
  const delAssign = useDeleteCommissionAssignment();
  const [confirm, confirmDialog] = useConfirm();
  const [dialog, setDialog] = useState<{ plan: CommissionPlan | null } | null>(null);
  const [empId, setEmpId] = useState("");
  const [planId, setPlanId] = useState("");
  const [from, setFrom] = useState("");

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "—";
  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "Former employee";
  };

  async function assign() {
    if (!empId || !planId) return toast.error("Choose an employee and a plan");
    try {
      await addAssign.mutateAsync({ employeeId: empId, planId, effectiveFrom: from || today() });
      setEmpId(""); setPlanId(""); setFrom("");
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Commission plans</h2>
          <Button size="sm" onClick={() => setDialog({ plan: null })}><Plus className="mr-1 h-4 w-4" /> New plan</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A rule sets the percentage a rep earns on pre-tax revenue for a service, a service category, or all services, for new sales or renewals,
          and either when payment is collected or when the invoice is issued. When several rules match a line, the most specific wins
          (service, then category, then all; a sale type beats &quot;New &amp; renewal&quot;). A rep can hold more than one plan at a time.
        </p>
        {plans.length === 0 && <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No plans yet.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" title="Edit" onClick={() => setDialog({ plan: p })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" title="Delete" onClick={async () => {
                    if (await confirm({ title: `Delete "${p.name}"?`, description: "Assigned reps stop earning under it. Existing statements are unaffected.", destructive: true, confirmLabel: "Delete" })) {
                      try { await delPlan.mutateAsync(p.id); } catch (e) { toast.error(errMsg(e)); }
                    }
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 divide-y rounded-md border text-sm">
                {p.rules.length === 0 && <p className="p-2 text-xs text-muted-foreground">No rules — this plan earns nothing yet.</p>}
                {p.rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2">
                    <span className="capitalize">{ruleScopeLabel(r, serviceName)} · {SALE_TYPE_LABEL[r.saleType]} · {EARNED_ON_LABEL[r.earnedOn]}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">{formatRate(r.rateBps)}</span>
                      <Button size="sm" variant="ghost" title="Remove rule" onClick={() => delRule.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </span>
                  </div>
                ))}
              </div>
              <AddRuleRow planId={p.id} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Rep assignments</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Employee…" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Plan…" /></SelectTrigger>
            <SelectContent>{plans.filter((p) => p.isActive).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="space-y-1"><Label className="text-xs">Effective from</Label><Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <Button size="sm" onClick={assign} disabled={addAssign.isPending}>Assign</Button>
        </div>
        <p className="text-xs text-muted-foreground">A rep can hold several plans at once (e.g. outside sales plus renewals). Use &quot;End today&quot; when a plan stops.</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Until</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {assignments.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No reps assigned.</td></tr>}
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{empName(a.employeeId)}</td>
                  <td className="px-3 py-2">{planName(a.planId)}</td>
                  <td className="px-3 py-2">{formatDate(a.effectiveFrom)}</td>
                  <td className="px-3 py-2">{a.effectiveTo ? formatDate(a.effectiveTo) : "Ongoing"}</td>
                  <td className="px-3 py-2 text-right">
                    {!a.effectiveTo && <Button size="sm" variant="ghost" onClick={() => endAssign.mutate({ id: a.id, effectiveTo: today() })}>End today</Button>}
                    <Button size="sm" variant="ghost" title="Remove" onClick={async () => {
                      if (await confirm({ title: "Remove this assignment?", description: "Earnings in that period will no longer be calculated for this rep.", destructive: true, confirmLabel: "Remove" })) delAssign.mutate(a.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && <PlanDialog key={dialog.plan?.id ?? "new"} plan={dialog.plan} open onOpenChange={(o) => !o && setDialog(null)} />}
      {confirmDialog}
    </div>
  );
}
