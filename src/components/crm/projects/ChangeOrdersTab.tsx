"use client";

import { useState } from "react";
import { Plus, Check, X, Trash2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, todayLocalISODate } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useChangeOrders,
  useCreateChangeOrder,
  useUpdateChangeOrder,
  useDeleteChangeOrder,
  useApproveChangeOrder,
  useReverseChangeOrder,
} from "@/lib/hooks/use-change-orders";
import type { Project, ChangeOrderStatus, ChangeOrderTreatment } from "@/types/project";

const STATUS_STYLE: Record<ChangeOrderStatus, string> = {
  draft:            "border-slate-200 bg-slate-50 text-slate-600",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-700",
  approved:         "border-green-200 bg-green-50 text-green-700",
  rejected:         "border-red-200 bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

const TREATMENT_LABEL: Record<ChangeOrderTreatment, string> = {
  distribute:       "Spread across remaining milestones",
  own_milestone:    "Bill on its own milestone",
  final_milestone:  "Add to the final milestone",
  none:             "Don't touch the schedule",
};

const TREATMENT_HELP: Record<ChangeOrderTreatment, string> = {
  distribute:
    "Adds this amount to the milestones not yet invoiced, in proportion to what they're currently worth. Anything already billed is left alone.",
  own_milestone:
    "Creates a new milestone for this amount so you can invoice the change order whenever you like, separately from the rest.",
  final_milestone:
    "Rolls this amount into the last milestone still pending — the usual choice when a change order is settled on the final invoice.",
  none:
    "Raises the contract but leaves the billing schedule untouched. The schedule will total less than the contract until you add it yourself.",
};

function NewChangeOrderDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { mutateAsync: create, isPending } = useCreateChangeOrder();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [treatment, setTreatment] = useState<ChangeOrderTreatment>("distribute");
  const [requestedDate, setRequestedDate] = useState(todayLocalISODate());
  const [clientReference, setClientReference] = useState("");

  function reset() {
    setTitle(""); setDescription(""); setAmount(""); setCost("");
    setTreatment("distribute"); setRequestedDate(todayLocalISODate()); setClientReference("");
  }

  const amountCents = Math.round((parseFloat(amount || "0")) * 100);

  async function submit() {
    if (!title.trim()) { toast.error("Give the change order a title"); return; }
    try {
      await create({
        projectId: project.id,
        title: title.trim(),
        description: description.trim(),
        amountCents,
        costImpactCents: Math.round((parseFloat(cost || "0")) * 100),
        billingTreatment: treatment,
        requestedDate,
        clientReference: clientReference.trim() || null,
      });
      toast.success("Change order created");
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Failed to create change order");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Change Order</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add stone patio" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What changed, and why" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Contract Change ($)</Label>
              <Input
                type="number" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              />
              <p className="text-[11px] text-slate-400">Negative for removed scope.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cost Impact ($)</Label>
              <Input
                type="number" step="0.01" value={cost}
                onChange={(e) => setCost(e.target.value)} placeholder="0.00"
              />
              <p className="text-[11px] text-slate-400">Added to the project&apos;s estimated cost.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Requested Date</Label>
              <Input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Client Reference</Label>
              <Input
                value={clientReference} onChange={(e) => setClientReference(e.target.value)}
                placeholder="Their PO #, email…"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>How should this be billed?</Label>
            <Select value={treatment} onValueChange={(v) => setTreatment(v as ChangeOrderTreatment)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TREATMENT_LABEL) as ChangeOrderTreatment[]).map((t) => (
                  <SelectItem key={t} value={t}>{TREATMENT_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">{TREATMENT_HELP[treatment]}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={submit} disabled={isPending}>{isPending ? "Creating…" : "Create"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeOrdersTab({ project }: { project: Project }) {
  const { can } = usePermissions();
  const canModify = can("sched_add_modify_projects");
  const { data: orders = [], isLoading } = useChangeOrders(project.id);
  const { mutateAsync: update } = useUpdateChangeOrder();
  const { mutateAsync: remove } = useDeleteChangeOrder();
  const { mutateAsync: approve, isPending: approving } = useApproveChangeOrder();
  const { mutateAsync: reverse, isPending: reversing } = useReverseChangeOrder();
  const [newOpen, setNewOpen] = useState(false);

  const approvedTotal = orders
    .filter((o) => o.status === "approved")
    .reduce((s, o) => s + o.amountCents, 0);
  const pendingTotal = orders
    .filter((o) => o.status === "draft" || o.status === "pending_approval")
    .reduce((s, o) => s + o.amountCents, 0);

  if (isLoading) return <p className="text-xs text-slate-400">Loading change orders…</p>;

  return (
    <div className="space-y-4">
      {/* Original → revised, the reason change orders exist */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded border bg-slate-100">
        {[
          { label: "Original Contract", value: formatCurrency(project.originalContractPrice) },
          { label: "Approved Changes", value: formatCurrency(approvedTotal), accent: approvedTotal !== 0 },
          { label: "Revised Contract", value: formatCurrency(project.contractPrice), bold: true },
        ].map((c) => (
          <div key={c.label} className="bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className={`mt-0.5 text-sm ${c.bold ? "font-bold text-slate-900" : c.accent ? "font-semibold text-green-700" : "font-medium text-slate-700"}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {pendingTotal !== 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {formatCurrency(pendingTotal)} in unapproved change orders isn&apos;t counted in the revised
          contract yet.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Change Orders</h3>
        {canModify && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Change Order
          </Button>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-slate-50 py-8 text-center">
          <FileSignature className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-xs text-slate-400">
            No change orders. Added scope recorded here keeps the original contract intact and
            adjusts the billing schedule for you.
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2">CO #</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Billing</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 align-middle hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">#{o.coNumber}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800">{o.title || "Untitled"}</p>
                    {o.description && <p className="text-xs text-slate-500">{o.description}</p>}
                    {o.clientReference && (
                      <p className="text-[11px] text-slate-400">Ref: {o.clientReference}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {new Date(o.requestedDate + "T12:00:00").toLocaleDateString("en-US", {
                      month: "numeric", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{TREATMENT_LABEL[o.billingTreatment]}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[o.status]}`}>
                      {STATUS_LABEL[o.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">
                    {o.costImpactCents ? formatCurrency(o.costImpactCents) : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${o.amountCents < 0 ? "text-red-600" : "text-slate-800"}`}>
                    {formatCurrency(o.amountCents)}
                  </td>
                  <td className="px-3 py-2">
                    {canModify && o.status !== "approved" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={approving}
                          title={TREATMENT_HELP[o.billingTreatment]}
                          onClick={async () => {
                            try {
                              await approve({ id: o.id, projectId: project.id });
                              toast.success(`CO #${o.coNumber} approved`);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to approve");
                            }
                          }}
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                          Approve
                        </Button>
                        {o.status !== "rejected" && (
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500"
                            title="Reject"
                            onClick={() => update(
                              { id: o.id, projectId: project.id, patch: { status: "rejected" } },
                              { onError: () => toast.error("Failed to reject") },
                            )}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500"
                          title="Delete"
                          onClick={() => remove(
                            { id: o.id, projectId: project.id },
                            { onError: () => toast.error("Failed to delete") },
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {o.status === "approved" && (
                      <div className="flex items-center justify-end gap-1">
                        {/* Reversing goes through its own RPC, which subtracts
                            exactly what the approval added to each milestone.
                            A plain soft delete would only drop the contract
                            price and leave the schedule billing the raised
                            amount — the database refuses that now. */}
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-slate-400 hover:text-red-500"
                          title="Reverse this change order — the contract price and the billing schedule both drop back"
                          disabled={!canModify || reversing}
                          onClick={async () => {
                            try {
                              await reverse({ id: o.id, projectId: project.id });
                              toast.success(`CO #${o.coNumber} reversed`);
                            } catch (e) {
                              // The RPC explains itself when a milestone has
                              // already been invoiced — show that, not "failed".
                              toast.error(e instanceof Error ? e.message : "Failed to reverse");
                            }
                          }}
                        >
                          Reverse
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewChangeOrderDialog project={project} open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
