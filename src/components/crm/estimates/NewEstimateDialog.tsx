"use client";

import { useEffect } from "react";
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
import { useCreateEstimate, useUpsertLineItem } from "@/lib/hooks/use-estimates";
import { useEstimateTemplates } from "@/lib/hooks/use-estimate-templates";
import { useClients } from "@/lib/hooks/use-clients";
import { computeLineItem } from "@/lib/estimate-calc";
import { toast } from "sonner";
import type { Estimate } from "@/types/crm-estimates";

const schema = z.object({
  clientId:       z.string().min(1, "Client is required"),
  description:    z.string().min(1, "Description is required"),
  estimateDate:   z.string().min(1),
  validUntilDate: z.string(),
  stage:          z.string(),
  templateId:     z.string(),
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
  const { mutateAsync: createEstimate, isPending } = useCreateEstimate();
  const { mutateAsync: upsertLineItem }             = useUpsertLineItem();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId:       defaultClientId ?? "",
      description:    `Estimate - ${defaultDescription()}`,
      estimateDate:   todayStr(),
      validUntilDate: thirtyDaysOut(),
      stage:          "draft",
      templateId:     "none",
    },
  });

  // Sync defaultClientId into the form when it changes (form only initializes once)
  useEffect(() => {
    if (defaultClientId) setValue("clientId", defaultClientId);
  }, [defaultClientId, setValue]);

  // Refresh date-based defaults each time the dialog opens
  useEffect(() => {
    if (open) {
      setValue("description", `Estimate - ${defaultDescription()}`);
      setValue("estimateDate", todayStr());
      setValue("validUntilDate", thirtyDaysOut());
    }
  }, [open, setValue]);

  async function onSubmit(values: FormValues) {
    try {
      const estimate = await createEstimate({
        clientId:       values.clientId,
        description:    values.description,
        estimateDate:   values.estimateDate,
        validUntilDate: values.validUntilDate || undefined,
        stage:          values.stage,
      });

      // Apply template line items if one was selected
      if (values.templateId && values.templateId !== "none") {
        const tpl = (templates ?? []).find((t) => t.id === values.templateId);
        if (tpl?.items?.length) {
          await Promise.all(
            tpl.items.map((item, idx) => {
              const computed = computeLineItem({
                calcType:      item.calcType,
                qty:           item.qty,
                rateCents:     item.rateCents,
                visits:        item.visits,
                budgetedHours: item.budgetedHours,
                costCents:     0,
                adjRateCents:  null,
              });
              return upsertLineItem({
                estimateId: estimate.id,
                item: {
                  service_id:           item.serviceId,
                  service_name:         item.serviceName,
                  status:               "quote",
                  calc_type:            item.calcType,
                  qty:                  item.qty,
                  rate_cents:           item.rateCents,
                  visits:               item.visits,
                  cost_cents:           0,
                  adj_rate_cents:       null,
                  sort_order:           idx,
                  total_cents:          computed.totalCents,
                  budgeted_hours:       computed.budgetedHours,
                  total_budgeted_hours: computed.totalBudgetedHours,
                  total_cost_cents:     computed.totalCostCents,
                  margin_bps:           computed.marginBps,
                  markup_bps:           computed.markupBps,
                },
              });
            })
          );
        }
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
              <Select
                value={watch("clientId")}
                onValueChange={(v) => setValue("clientId", v)}
              >
                <SelectTrigger className={errors.clientId ? "border-red-400" : ""}>
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {(clients ?? [])
                    .filter((c) => c.status !== "inactive" && c.status !== "cancelled")
                    .sort((a, b) => {
                      if (a.status === "lead" && b.status !== "lead") return 1;
                      if (a.status !== "lead" && b.status === "lead") return -1;
                      return a.displayName.localeCompare(b.displayName);
                    })
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName}{c.status === "lead" ? " (lead)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.clientId && (
                <p className="text-xs text-red-500">{errors.clientId.message}</p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label>Description *</Label>
            <Input
              {...register("description")}
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
              <Label>Valid Until</Label>
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
          <Button onClick={handleSubmit(onSubmit)} disabled={isPending}>
            {isPending ? "Creating…" : "Create Estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
