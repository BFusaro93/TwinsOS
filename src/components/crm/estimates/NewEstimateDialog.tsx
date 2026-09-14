"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { useCreateEstimate, useUpsertLineItem } from "@/lib/hooks/use-estimates";
import { useEstimateTemplates } from "@/lib/hooks/use-estimate-templates";
import { useClients } from "@/lib/hooks/use-clients";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { computeLineItem, getBreakevenRateCents } from "@/lib/estimate-calc";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { getOrgDefaultDisplaySettings } from "@/lib/estimate-display-settings";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { toast } from "sonner";
import type { Estimate } from "@/types/crm-estimates";

const schema = z.object({
  clientId:       z.string().min(1, "Client is required"),
  description:    z.string().min(1, "Description is required"),
  estimateDate:   z.string().min(1),
  validUntilDate: z.string(),
  stage:          z.string(),
  templateId:     z.string(),
  salesRepId:     z.string(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  onCreated?: (estimate: Estimate) => void;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultDescription() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function thirtyDaysOut() {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewEstimateDialog({ open, onOpenChange, defaultClientId, onCreated }: Props) {
  const router = useRouter();
  const { data: clients }   = useClients();
  const { data: templates } = useEstimateTemplates();
  const { data: employees } = useSelectableEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep);
  const { mutateAsync: createEstimate, isPending } = useCreateEstimate();
  const { mutateAsync: upsertLineItem }             = useUpsertLineItem();
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);
  const { data: crmServices } = useCRMServices();
  const rf = useRequiredFields("estimate");

  const selectableClients = (clients ?? [])
    .filter((c) => c.status !== "inactive" && c.status !== "cancelled")
    .sort((a, b) => {
      if (a.status === "lead" && b.status !== "lead") return 1;
      if (a.status !== "lead" && b.status === "lead") return -1;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((c) => ({
      id: c.id,
      displayName: c.status === "lead" ? `${c.displayName} (lead)` : c.displayName,
      billingAddress: c.billingAddress,
    }));

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId:       defaultClientId ?? "",
      description:    `Estimate - ${defaultDescription()}`,
      estimateDate:   todayStr(),
      validUntilDate: thirtyDaysOut(),
      stage:          "draft",
      templateId:     "none",
      salesRepId:     "none",
    },
  });

  // Sync defaultClientId into the form when it changes (form only initializes once)
  useEffect(() => {
    if (defaultClientId) setValue("clientId", defaultClientId);
  }, [defaultClientId, setValue]);

  // The auto-generated "Estimate - <date>" description is only a placeholder
  // for an untouched field. Once the user types their own text it must never
  // be overwritten by a later re-run of the defaults effect (which was wiping
  // it when Sales Rep was picked) — track that with a dirty flag.
  const descriptionDirty = useRef(false);
  const descriptionField = register("description", {
    onChange: () => { descriptionDirty.current = true; },
  });

  // Refresh date-based defaults each time the dialog opens
  useEffect(() => {
    if (open) {
      descriptionDirty.current = false;
      setValue("description", `Estimate - ${defaultDescription()}`);
      setValue("estimateDate", todayStr());
      setValue("validUntilDate", thirtyDaysOut());
    }
  }, [open, setValue]);

  async function onSubmit(values: FormValues) {
    if (rf.isRequired("valid_until") && !values.validUntilDate) {
      toast.error("Valid Until is required");
      return;
    }
    if (rf.isRequired("sales_rep") && values.salesRepId === "none") {
      toast.error("Sales Rep is required");
      return;
    }
    try {
      const tpl = values.templateId && values.templateId !== "none"
        ? (templates ?? []).find((t) => t.id === values.templateId)
        : undefined;
      const displaySettings = tpl?.displaySettings ?? getOrgDefaultDisplaySettings(orgSettings?.customizations);

      const estimate = await createEstimate({
        clientId:       values.clientId,
        description:    values.description,
        estimateDate:   values.estimateDate,
        validUntilDate: values.validUntilDate || undefined,
        stage:          values.stage,
        salesRepId:     values.salesRepId !== "none" ? values.salesRepId : undefined,
        displaySettings,
      });

      // Apply template line items if one was selected
      if (tpl?.items?.length) {
        await Promise.all(
          tpl.items.map((item, idx) => {
            // Carry over the matched service's budget method / production rate
            // (same as EstimateLineItemsGrid's addService) so a production_rate
            // service applied via template doesn't silently fall back to manual
            // budgeting with 0 budgeted hours.
            const matchedService = item.serviceId
              ? (crmServices ?? []).find((s) => s.id === item.serviceId)
              : undefined;
            const budgetMethod = matchedService?.budgetMethod ?? "manual";
            const productionRate = matchedService?.productionRateSqftPerHr ?? null;
            const computed = computeLineItem({
              calcType:      item.calcType,
              qty:           item.qty,
              unitType:      item.unitType,
              rateCents:     item.rateCents,
              visits:        item.visits,
              budgetedHours: item.budgetedHours,
              costCents:     0,
              adjRateCents:  null,
              budgetMethod:  item.budgetMethod,
              productionRateSqftPerHr: item.productionRateSqftPerHr,
            }, breakevenRateCents);
            return upsertLineItem({
              estimateId: estimate.id,
              item: {
                service_id:           item.serviceId,
                service_name:         item.serviceName,
                status:               "quote",
                calc_type:            item.calcType,
                qty:                  item.qty,
                unit_type:            item.unitType,
                rate_cents:           item.rateCents,
                visits:               item.visits,
                cost_cents:           computed.costCents,
                adj_rate_cents:       null,
                sort_order:           idx,
                budget_method:        item.budgetMethod,
                production_rate_sqft_per_hr: item.productionRateSqftPerHr,
                total_cents:          computed.totalCents,
                budgeted_hours:       computed.budgetedHours,
                total_budgeted_hours: computed.totalBudgetedHours,
                total_cost_cents:     computed.totalCostCents,
                margin_bps:           computed.marginBps,
                markup_bps:           computed.markupBps,
                discount_cents:       item.discountCents,
                discount_type:        item.discountType,
                discount_value:       item.discountValue,
                applied_discount_id:  item.appliedDiscountId,
              },
            });
          })
        );
      }

      toast.success("Estimate created");
      reset();
      onOpenChange(false);
      if (onCreated) {
        onCreated(estimate);
      } else {
        router.push(`/crm/estimates/${estimate.id}`);
      }
    } catch {
      toast.error("Failed to create estimate");
    }
  }

  const selectedTemplateId = watch("templateId");
  const selectedTemplate   = (templates ?? []).find((t) => t.id === selectedTemplateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Estimate</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 py-2">
          {/* Client */}
          {!defaultClientId && (
            <div className="flex flex-col gap-1.5">
              <Label>Client *</Label>
              <ClientCombobox
                clients={selectableClients}
                value={watch("clientId")}
                onValueChange={(v) => setValue("clientId", v)}
                noneLabel="Select client…"
              />
              {errors.clientId && (
                <p className="text-xs text-red-500">{errors.clientId.message}</p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label>Description *</Label>
            <Input
              {...descriptionField}
              placeholder="e.g. Spring Cleanup Estimate"
              className={errors.description ? "border-red-400" : ""}
            />
            {errors.description && (
              <p className="text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Estimate Date</Label>
              <Input type="date" {...register("estimateDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Valid Until{rf.req("valid_until")}</Label>
              <Input type="date" {...register("validUntilDate")} />
            </div>
          </div>

          {/* Stage + Template */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Stage</Label>
              <Select value={watch("stage")} onValueChange={(v) => setValue("stage", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sales Rep{rf.req("sales_rep")}</Label>
              <Select value={watch("salesRepId")} onValueChange={(v) => setValue("salesRepId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign sales rep…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {salesReps.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Template</Label>
              <Select
                value={watch("templateId")}
                onValueChange={(v) => setValue("templateId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Template preview */}
          {selectedTemplate?.items?.length ? (
            <div className="rounded-md bg-brand-50 border border-brand-100 px-3 py-2">
              <p className="text-xs font-medium text-brand-700 mb-1">
                {selectedTemplate.items.length} service{selectedTemplate.items.length !== 1 ? "s" : ""} will be added:
              </p>
              <ul className="space-y-0.5">
                {selectedTemplate.items.slice(0, 5).map((item) => (
                  <li key={item.id} className="text-[11px] text-brand-600">
                    · {item.serviceName}
                    {item.rateCents > 0 && ` — $${(item.rateCents / 100).toFixed(2)}`}
                  </li>
                ))}
                {selectedTemplate.items.length > 5 && (
                  <li className="text-[11px] text-brand-400">
                    + {selectedTemplate.items.length - 5} more…
                  </li>
                )}
              </ul>
            </div>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={
              isPending ||
              (rf.isRequired("valid_until") && !watch("validUntilDate")) ||
              (rf.isRequired("sales_rep") && watch("salesRepId") === "none")
            }
          >
            {isPending ? "Creating…" : "Create Estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
