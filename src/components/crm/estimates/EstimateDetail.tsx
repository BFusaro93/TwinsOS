"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useEstimate,
  useUpdateEstimate,
  useUpdateEstimateStage,
  useSaveEstimateFinancials,
  useUpsertLineItem,
} from "@/lib/hooks/use-estimates";
import { useCreateInvoiceFromEstimate } from "@/lib/hooks/use-invoices";
import { useEstimateTemplates } from "@/lib/hooks/use-estimate-templates";
import { useClients } from "@/lib/hooks/use-clients";
import { computeLineItem } from "@/lib/estimate-calc";
import { EstimateLineItemsGrid } from "./EstimateLineItemsGrid";
import { EstimateDirectCostsGrid } from "./EstimateDirectCostsGrid";
import { EstimateSummaryPanel } from "./EstimateSummaryPanel";
import { ConvertToJobDialog } from "./ConvertToJobDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  XCircle,
  FileText,
  Calendar,
  Receipt,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import type { EstimateStage, LineItemStatus } from "@/types/crm-estimates";

const STAGE_COLOR: Record<EstimateStage, string> = {
  draft:    "bg-slate-100 text-slate-600",
  quote:    "bg-blue-100 text-blue-700",
  sent:     "bg-yellow-100 text-yellow-700",
  approved: "bg-purple-100 text-purple-700",
  won:      "bg-green-100 text-green-700",
  lost:     "bg-red-100 text-red-600",
  invoiced: "bg-teal-100 text-teal-700",
};

const STAGE_LABEL: Record<EstimateStage, string> = {
  draft:    "Estimate Drafted",
  quote:    "Quote Ready",
  sent:     "Estimate Sent",
  approved: "Approved",
  won:      "Closed - Won",
  lost:     "Closed - Lost",
  invoiced: "Invoiced",
};

const STAGES: EstimateStage[] = ["draft","quote","sent","approved","won","lost","invoiced"];

const LINE_ITEM_TABS: { value: LineItemStatus | "all"; label: string }[] = [
  { value: "all",   label: "All" },
  { value: "quote", label: "Quote" },
  { value: "draft", label: "Draft" },
  { value: "won",   label: "Won" },
  { value: "lost",  label: "Lost" },
];

type Tab = "details" | "notes" | "attachments" | "audit";

interface Props {
  estimateId: string;
  onClose?: () => void;
}

export function EstimateDetail({ estimateId, onClose }: Props) {
  const router = useRouter();
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const { data: templates } = useEstimateTemplates();
  const { data: clients }   = useClients();
  const { mutateAsync: updateEstimate } = useUpdateEstimate();
  const { mutateAsync: updateStage } = useUpdateEstimateStage();
  const { mutateAsync: saveFinancials } = useSaveEstimateFinancials();
  const { mutateAsync: upsertLineItem } = useUpsertLineItem();
  const { mutateAsync: createInvoice, isPending: creatingInvoice } = useCreateInvoiceFromEstimate();

  const [activeTab,        setActiveTab]        = useState<Tab>("details");
  const [lineItemFilter,   setLineItemFilter]   = useState<LineItemStatus | "all">("all");
  const [saving,           setSaving]           = useState(false);
  const [recalcPending,    setRecalcPending]    = useState(false);
  const [headerEdits,      setHeaderEdits]      = useState<Record<string, string | boolean | number>>({});
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);

  function patchHeader(key: string, val: string | boolean | number) {
    setHeaderEdits((p) => ({ ...p, [key]: val }));
  }

  async function saveHeader() {
    if (!estimate || Object.keys(headerEdits).length === 0) return;
    setSaving(true);
    try {
      await updateEstimate({ id: estimate.id, patch: headerEdits });
      setHeaderEdits({});
      toast.success("Saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStage(stage: EstimateStage) {
    if (!estimate) return;
    try {
      await updateStage({ id: estimate.id, stage });
      toast.success(`Marked as ${STAGE_LABEL[stage]}`);
    } catch {
      toast.error("Failed to update stage");
    }
  }

  async function handleSaveFinancials(overrides?: {
    taxRateBps?: number;
    overheadRateBps?: number;
    discountCents?: number;
  }) {
    if (!estimate) return;
    setRecalcPending(true);
    try {
      await saveFinancials({
        id: estimate.id,
        lineItems: estimate.lineItems ?? [],
        directCosts: estimate.directCosts ?? [],
        taxRateBps:      overrides?.taxRateBps      ?? estimate.taxRateBps,
        overheadRateBps: overrides?.overheadRateBps ?? estimate.overheadRateBps,
        discountCents:   overrides?.discountCents   ?? estimate.discountCents,
      });
    } catch {
      toast.error("Recalculation failed");
    } finally {
      setRecalcPending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!estimate) {
    return <div className="p-6 text-sm text-slate-500">Estimate not found.</div>;
  }

  const effectiveStage = (headerEdits.stage ?? estimate.stage) as EstimateStage;

  const visibleLineItems = (estimate.lineItems ?? []).filter((li) => {
    if (li.deletedAt) return false;
    if (lineItemFilter === "all") return true;
    return li.status === lineItemFilter;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onClose ? onClose() : router.back()}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Edit Estimate (#{estimate.estimateNumber})
              <span className="ml-2 text-slate-400 text-sm font-normal">—</span>
              <span className="ml-2">
                <Badge className={cn("text-[10px]", STAGE_COLOR[effectiveStage])}>
                  {STAGE_LABEL[effectiveStage]}
                </Badge>
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Code: {estimate.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => setConvertDialogOpen(true)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-500" />Won
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => handleStage("lost")}>
            <XCircle className="mr-1 h-3.5 w-3.5 text-red-400" />Lost
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => handleStage("draft")}>
            Draft
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => handleStage("quote")}>
            <FileText className="mr-1 h-3.5 w-3.5 text-blue-400" />Quote
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => handleStage("sent")}>
            <Calendar className="mr-1 h-3.5 w-3.5 text-yellow-500" />Send
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={creatingInvoice}
            onClick={async () => {
              if (!estimate) return;
              try {
                const today = new Date().toISOString().slice(0, 10);
                const invoice = await createInvoice({
                  estimateId: estimate.id,
                  clientId: estimate.clientId,
                  description: estimate.description ?? `Invoice for estimate #${estimate.estimateNumber}`,
                  invoiceDate: today,
                  lineItems: (estimate.lineItems ?? [])
                    .filter((li) => !li.deletedAt)
                    .map((li) => ({
                      description: li.serviceName ?? li.serviceId ?? "Service",
                      qty: li.qty,
                      rateCents: li.rateCents,
                      totalCents: li.totalCents,
                    })),
                  subtotalCents: estimate.subtotalCents ?? 0,
                  taxRateBps: estimate.taxRateBps ?? 0,
                  taxCents: estimate.taxCents ?? 0,
                  totalCents: estimate.totalCents ?? 0,
                });
                await updateStage({ id: estimate.id, stage: "invoiced" });
                toast.success("Invoice created");
                router.push(`/crm/accounting/invoices/${invoice.id}`);
              } catch {
                toast.error("Failed to create invoice");
              }
            }}
          >
            <Receipt className="mr-1 h-3.5 w-3.5 text-teal-500" />
            {creatingInvoice ? "Creating…" : "Invoice"}
          </Button>
          <div className="ml-1 h-5 w-px bg-slate-200" />
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={saving || recalcPending}
            onClick={() => { saveHeader(); handleSaveFinancials(); }}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving || recalcPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* ── tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b bg-white px-6">
        {(["details", "notes", "attachments", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              "px-4 py-2 text-sm capitalize transition-colors border-b-2",
              activeTab === t
                ? "border-brand-500 text-brand-600 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t === "audit" ? "Audit Trail" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 overflow-auto p-6">

        {/* ── left ── */}
        <div className="flex flex-1 flex-col gap-4 min-w-0">

          {activeTab === "details" && (
            <>
              {/* Client info card + header form */}
              <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
                <div className="flex gap-0">

                  {/* Client info card */}
                  <div className="w-56 shrink-0 bg-slate-50 border-r p-4 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                      Client
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{estimate.clientName}</p>
                    {estimate.clientAddress && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-500">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          {estimate.clientAddress}
                          {estimate.clientCity && <><br />{estimate.clientCity}{estimate.clientState ? `, ${estimate.clientState}` : ""} {estimate.clientZip ?? ""}</>}
                        </span>
                      </div>
                    )}
                    {estimate.clientPhone && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Phone className="h-3 w-3 shrink-0" />
                        {estimate.clientPhone}
                      </div>
                    )}
                    {estimate.clientSince && (
                      <p className="text-[10px] text-slate-400">
                        Client since {new Date(estimate.clientSince + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </p>
                    )}
                    {estimate.salesRepName && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <User className="h-3 w-3 shrink-0" />
                        {estimate.salesRepName}
                      </div>
                    )}
                    <div className="mt-auto pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Total</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {formatCurrency(estimate.totalCents)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Header form */}
                  <div className="flex-1 p-4">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">

                      {/* Left column */}
                      <div className="flex flex-col gap-3">
                        <FieldRow label="Description">
                          <Input
                            value={(headerEdits.description as string) ?? estimate.description}
                            onChange={(e) => patchHeader("description", e.target.value)}
                            onBlur={saveHeader}
                            className="h-8 text-sm"
                          />
                        </FieldRow>
                        <FieldRow label="Client">
                          <Select
                            value={(headerEdits.client_id as string) ?? estimate.clientId}
                            onValueChange={(v) => { patchHeader("client_id", v); }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(clients ?? []).filter((c) => c.status !== "lead").map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Sales Rep">
                          <Input
                            value={(headerEdits.sales_rep_id as string) ?? (estimate.salesRepName ?? "")}
                            onChange={(e) => patchHeader("sales_rep_id", e.target.value)}
                            onBlur={saveHeader}
                            className="h-8 text-sm"
                            placeholder="Assign sales rep…"
                          />
                        </FieldRow>
                        <FieldRow label="Stage">
                          <Select
                            value={effectiveStage}
                            onValueChange={(v) => {
                              patchHeader("stage", v);
                              handleStage(v as EstimateStage);
                            }}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => (
                                <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Show Discounts">
                          <div className="flex items-center gap-2 h-8">
                            <Checkbox
                              checked={
                                headerEdits.show_discounts !== undefined
                                  ? Boolean(headerEdits.show_discounts)
                                  : estimate.showDiscounts
                              }
                              onCheckedChange={(v) => {
                                patchHeader("show_discounts", Boolean(v));
                                saveHeader();
                              }}
                            />
                            <span className="text-xs text-slate-500">Show on estimate document</span>
                          </div>
                        </FieldRow>
                      </div>

                      {/* Right column */}
                      <div className="flex flex-col gap-3">
                        <FieldRow label="Estimate Date">
                          <Input
                            type="date"
                            value={(headerEdits.estimate_date as string) ?? estimate.estimateDate}
                            onChange={(e) => patchHeader("estimate_date", e.target.value)}
                            onBlur={saveHeader}
                            className="h-8 w-36"
                          />
                        </FieldRow>
                        <FieldRow label="Valid Until">
                          <Input
                            type="date"
                            value={(headerEdits.valid_until_date as string) ?? (estimate.validUntilDate ?? "")}
                            onChange={(e) => patchHeader("valid_until_date", e.target.value)}
                            onBlur={saveHeader}
                            className="h-8 w-36"
                          />
                        </FieldRow>
                        <FieldRow label="# of Installments">
                          <Input
                            type="number"
                            min={1}
                            value={(headerEdits.num_installments as number) ?? estimate.numInstallments}
                            onChange={(e) => patchHeader("num_installments", Number(e.target.value))}
                            onBlur={saveHeader}
                            className="h-8 w-20"
                          />
                        </FieldRow>
                        <FieldRow label="Probability %">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={
                                headerEdits.probability_bps !== undefined
                                  ? Math.round((headerEdits.probability_bps as number) / 100)
                                  : Math.round(estimate.probabilityBps / 100)
                              }
                              onChange={(e) => patchHeader("probability_bps", Math.round(Number(e.target.value) * 100))}
                              onBlur={saveHeader}
                              className="h-8 w-20"
                            />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                        </FieldRow>
                        <FieldRow label="PO Number">
                          <Input
                            value={(headerEdits.po_number as string) ?? (estimate.poNumber ?? "")}
                            onChange={(e) => patchHeader("po_number", e.target.value)}
                            onBlur={saveHeader}
                            className="h-8"
                            placeholder="PO Number"
                          />
                        </FieldRow>
                        <FieldRow label="Work Order #">
                          <Input
                            value={(headerEdits.work_order_number as string) ?? (estimate.workOrderNumber ?? "")}
                            onChange={(e) => patchHeader("work_order_number", e.target.value)}
                            onBlur={saveHeader}
                            className="h-8"
                            placeholder="Work Order Number"
                          />
                        </FieldRow>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Templates toolbar */}
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={async (templateId) => {
                    if (!estimate || !templateId) return;
                    const tpl = (templates ?? []).find((t) => t.id === templateId);
                    if (!tpl?.items?.length) { toast.info("Template has no items"); return; }
                    setSaving(true);
                    try {
                      const existingCount = (estimate.lineItems ?? []).filter((li) => !li.deletedAt).length;
                      await Promise.all(
                        tpl.items.map((item, idx) => {
                          const computed = computeLineItem({
                            calcType: item.calcType,
                            qty: item.qty,
                            rateCents: item.rateCents,
                            visits: item.visits,
                            budgetedHours: item.budgetedHours,
                            costCents: 0,
                            adjRateCents: null,
                          });
                          return upsertLineItem({
                            estimateId: estimate.id,
                            item: {
                              service_id: item.serviceId,
                              service_name: item.serviceName,
                              status: "quote",
                              calc_type: item.calcType,
                              qty: item.qty,
                              rate_cents: item.rateCents,
                              visits: item.visits,
                              budgeted_hours: item.budgetedHours,
                              cost_cents: 0,
                              adj_rate_cents: null,
                              sort_order: existingCount + idx,
                              ...computed,
                            },
                          });
                        })
                      );
                      toast.success(`Applied template "${tpl.name}"`);
                    } catch {
                      toast.error("Failed to apply template");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder="Apply template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Line item filter tabs */}
              <div className="flex items-center gap-0 border-b">
                {LINE_ITEM_TABS.map((t) => {
                  const cnt = t.value === "all"
                    ? (estimate.lineItems ?? []).filter((li) => !li.deletedAt).length
                    : (estimate.lineItems ?? []).filter((li) => !li.deletedAt && li.status === t.value).length;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setLineItemFilter(t.value)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                        lineItemFilter === t.value
                          ? "border-brand-500 text-brand-600"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {t.label}
                      {cnt > 0 && (
                        <span className="ml-1 text-[10px] text-slate-400">({cnt})</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Line items grid */}
              <EstimateLineItemsGrid
                estimateId={estimate.id}
                items={visibleLineItems}
              />

              {/* Direct costs */}
              <EstimateDirectCostsGrid
                estimateId={estimate.id}
                items={estimate.directCosts ?? []}
              />
            </>
          )}

          {activeTab === "notes" && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <textarea
                value={(headerEdits.notes as string) ?? (estimate.notes ?? "")}
                onChange={(e) => patchHeader("notes", e.target.value)}
                onBlur={saveHeader}
                rows={10}
                placeholder="Add notes…"
                className="w-full rounded border border-slate-200 p-2 text-sm focus:border-brand-400 focus:outline-none resize-none"
              />
            </div>
          )}

          {activeTab === "attachments" && (
            <div className="rounded-lg border bg-white p-6 shadow-sm flex flex-col items-center justify-center min-h-40 text-sm text-slate-400">
              Attachments coming soon
            </div>
          )}

          {activeTab === "audit" && (
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <AuditTrailTab recordType="estimate" recordId={estimate.id} />
            </div>
          )}
        </div>

        {/* ── right: summary panel ── */}
        <div className="w-64 shrink-0">
          <EstimateSummaryPanel
            estimate={estimate}
            onRecalculate={handleSaveFinancials}
            recalcPending={recalcPending}
          />
        </div>
      </div>

      {convertDialogOpen && (
        <ConvertToJobDialog
          open={convertDialogOpen}
          estimate={estimate}
          onClose={() => setConvertDialogOpen(false)}
          onConverted={(jobId) => {
            router.push(`/crm/scheduling`);
          }}
        />
      )}
    </div>
  );
}

// ── helper ────────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="w-32 shrink-0 text-slate-500 text-xs">{label}</Label>
      {children}
    </div>
  );
}
