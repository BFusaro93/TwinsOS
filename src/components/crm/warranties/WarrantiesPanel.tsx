"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Play, RefreshCw, Ban, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/components/shared/useConfirm";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import {
  useCreateWarranty,
  useDeleteWarranty,
  useUpdateWarranty,
  useVoidWarranty,
  useWarranties,
  type WarrantyScope,
} from "@/lib/hooks/use-warranties";
import { formatCurrency, formatDate } from "@/lib/utils";
import { shiftYmd } from "@/lib/time/zone";
import { formatWarrantyCountdown, formatWarrantyTerm, warrantyEndFromTerm } from "@/lib/utils/warranty";
import type { CRMWarranty } from "@/types/crm-warranties";
import { WarrantyDialog } from "./WarrantyDialog";
import { WarrantyStatusBadge, warrantyDisplayState } from "./WarrantyStatusBadge";

interface Props {
  /** clientId is required to add; project/job narrow what is listed and attach new warranties. */
  scope: WarrantyScope;
  projectComplete?: boolean;
}

export function WarrantiesPanel({ scope, projectComplete }: Props) {
  const { data: warranties = [], isLoading } = useWarranties(scope);
  const { can } = usePermissions();
  const canManage = can("warranty_manage");
  const { today } = useOrgDates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CRMWarranty | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const update = useUpdateWarranty();
  const create = useCreateWarranty();
  const voidWarranty = useVoidWarranty();
  const del = useDeleteWarranty();

  function asInput(w: CRMWarranty, over: { startDate: string | null; endDate: string | null }) {
    return {
      id: w.id,
      clientId: w.clientId,
      projectId: w.projectId,
      jobId: w.jobId,
      warrantyTypeId: w.warrantyTypeId,
      name: w.name,
      coverage: w.coverage,
      durationMonths: w.durationMonths,
      damagesCoveredCents: w.damagesCoveredCents,
      notes: w.notes,
      renewedFromId: w.renewedFromId,
      ...over,
    };
  }

  async function startNow(w: CRMWarranty) {
    const start = today();
    try {
      await update.mutateAsync(asInput(w, { startDate: start, endDate: warrantyEndFromTerm(start, w.durationMonths) }));
      toast.success("Warranty started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start warranty");
    }
  }

  async function renew(w: CRMWarranty) {
    // Renewing before expiry continues from the day after it ends.
    const start = w.endDate && w.endDate >= today() ? shiftYmd(w.endDate, 1) : today();
    if (!(await confirm({
      title: `Renew "${w.name}"?`,
      description: `Adds a new ${formatWarrantyTerm(w.durationMonths)} warranty starting ${formatDate(start)}.`,
      confirmLabel: "Renew",
    }))) return;
    try {
      await create.mutateAsync({
        clientId: w.clientId,
        projectId: w.projectId,
        jobId: w.jobId,
        warrantyTypeId: w.warrantyTypeId,
        name: w.name,
        coverage: w.coverage,
        durationMonths: w.durationMonths,
        startDate: start,
        endDate: warrantyEndFromTerm(start, w.durationMonths),
        damagesCoveredCents: w.damagesCoveredCents,
        notes: w.notes,
        renewedFromId: w.id,
      });
      toast.success("Warranty renewed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not renew warranty");
    }
  }

  async function doVoid(w: CRMWarranty) {
    if (!(await confirm({ title: `Void "${w.name}"?`, description: "It will no longer count as coverage. This can't be undone.", confirmLabel: "Void", destructive: true }))) return;
    try {
      await voidWarranty.mutateAsync({ id: w.id, reason: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not void warranty");
    }
  }

  async function doDelete(w: CRMWarranty) {
    if (!(await confirm({ title: `Delete "${w.name}"?`, destructive: true, confirmLabel: "Delete" }))) return;
    try {
      await del.mutateAsync(w.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete warranty");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Warranties</h3>
        {canManage && scope.clientId && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add warranty
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : warranties.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No warranties" description="Warranties on walls, walkways, patios and renovations show up here with their start and end dates." />
      ) : (
        <div className="divide-y rounded-md border">
          {warranties.map((w) => {
            const { state, daysLeft } = warrantyDisplayState(w, today());
            return (
              <div key={w.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{w.name}</span>
                    <WarrantyStatusBadge warranty={w} today={today()} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatWarrantyTerm(w.durationMonths)}
                    {w.startDate && w.endDate
                      ? ` · ${formatDate(w.startDate)} – ${formatDate(w.endDate)}`
                      : " · starts when the project is completed"}
                    {daysLeft != null && state !== "void" ? ` · ${formatWarrantyCountdown(daysLeft)}` : ""}
                  </p>
                  {w.coverage && <p className="text-xs text-muted-foreground">{w.coverage}</p>}
                  {(w.claimCount > 0 || w.damagesCoveredCents != null) && (
                    <p className="text-xs text-muted-foreground">
                      {w.claimCount} claim{w.claimCount === 1 ? "" : "s"} · {formatCurrency(w.claimedCents)} spent
                      {w.damagesCoveredCents != null ? ` of ${formatCurrency(w.damagesCoveredCents)} covered` : ""}
                    </p>
                  )}
                  {w.status === "void" && w.voidReason && <p className="text-xs text-muted-foreground">Void: {w.voidReason}</p>}
                </div>
                {canManage && w.status !== "void" && (
                  <div className="flex shrink-0 gap-1">
                    {w.status === "pending" && (
                      <Button size="sm" variant="ghost" title="Start now" onClick={() => startNow(w)}><Play className="h-4 w-4" /></Button>
                    )}
                    {w.status === "active" && (
                      <Button size="sm" variant="ghost" title="Renew" onClick={() => renew(w)}><RefreshCw className="h-4 w-4" /></Button>
                    )}
                    <Button size="sm" variant="ghost" title="Edit" onClick={() => { setEditing(w); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Void" onClick={() => doVoid(w)}><Ban className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Delete" onClick={() => doDelete(w)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <WarrantyDialog open={dialogOpen} onOpenChange={setDialogOpen} scope={scope} projectComplete={projectComplete} editing={editing} />
      {confirmDialog}
    </div>
  );
}
