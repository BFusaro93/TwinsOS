"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEstimate,
  useUpdateEstimate,
  useUpdateEstimateStage,
  useSaveEstimateFinancials,
  useUpsertLineItem,
  useEstimateShareTokens,
  useEstimateVersions,
  useEstimateChangeRequests,
  useResolveChangeRequest,
  recalcEstimateTotals,
  type AIDraftLineItem,
  type EstimateVersion,
} from "@/lib/hooks/use-estimates";
import { useCreateInvoiceFromEstimate } from "@/lib/hooks/use-invoices";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useApprovalFlow } from "@/lib/hooks/use-approval-flows";
import { useSubmitForApproval } from "@/lib/hooks/use-approval-requests";
import { ApprovalChain } from "@/components/shared/ApprovalChain";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { useEstimateTemplates } from "@/lib/hooks/use-estimate-templates";
import { useClients } from "@/lib/hooks/use-clients";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { computeLineItem, hasPerTypeOverhead, getBreakevenRateCents, computeInstallmentSchedule } from "@/lib/estimate-calc";
import { useOverheadSettings } from "@/lib/hooks/use-overhead-settings";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { EstimateLineItemsGrid } from "./EstimateLineItemsGrid";
import { EstimateDirectCostsGrid } from "./EstimateDirectCostsGrid";
import { EstimateMilestonesEditor } from "./EstimateMilestonesEditor";
import { EstimateSummaryPanel } from "./EstimateSummaryPanel";
import { AIDraftDialog } from "./AIDraftDialog";
import { ConvertToJobDialog } from "./ConvertToJobDialog";
import { WonLostReasonDialog } from "./WonLostReasonDialog";
import { RateIncreaseDialog } from "./RateIncreaseDialog";
import { BulkStatusDialog } from "./BulkStatusDialog";
import { SendEstimateDialog } from "./SendEstimateDialog";
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
import { stripHtml } from "@/lib/utils/strip-html";
import { BILLING_TERMS_OPTIONS } from "@/lib/constants";
import { toast } from "sonner";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { EstimatePhotosTab } from "./EstimatePhotosTab";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/estimate-display-settings";
import { EstimateDisplaySettingsPanel } from "./EstimateDisplaySettingsPanel";
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
  Upload,
  Paperclip,
  Trash2,
  Download,
  TrendingUp,
  Eye,
  Printer,
  Send,
  Sparkles,
  MessageSquarePlus,
  Pencil,
} from "lucide-react";
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  useDownloadAttachment,
} from "@/lib/hooks/use-attachments";
import type { EstimateStage, LineItemStatus } from "@/types/crm-estimates";
import type { DiscountType } from "@/types/crm-discounts";
import {
  useEstimateStages,
  useSeedDefaultStages,
  type EstimateStage as DBEstimateStage,
} from "@/lib/hooks/use-estimate-stages";

// Stage colors are keyed by stage_key — fallback palette for system stages
const DEFAULT_STAGE_COLORS: Record<string, string> = {
  draft:    "bg-slate-100 text-slate-600",
  quote:    "bg-blue-100 text-blue-700",
  sent:     "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  lost:     "bg-red-100 text-red-600",
  invoiced: "bg-teal-100 text-teal-700",
};

const DEFAULT_STAGE_LIST: { stageKey: string; name: string }[] = [
  { stageKey: "draft",    name: "Estimate Drafted" },
  { stageKey: "quote",    name: "Quote Ready" },
  { stageKey: "sent",     name: "Estimate Sent" },
  { stageKey: "accepted", name: "Accepted" },
  { stageKey: "lost",     name: "Closed - Lost" },
  { stageKey: "invoiced", name: "Invoiced" },
];

const LINE_ITEM_TABS: { value: LineItemStatus | "all"; label: string }[] = [
  { value: "all",   label: "All" },
  { value: "draft", label: "Draft" },
  { value: "quote", label: "Quote" },
  { value: "won",   label: "Won" },
  { value: "lost",  label: "Lost" },
];

type Tab = "details" | "payment" | "display" | "notes" | "photos" | "attachments" | "comments" | "audit" | "versions";

// ── Attachments tab ────────────────────────────────────────────────────────────

function EstimateAttachmentsTab({ estimateId }: { estimateId: string }) {
  const { data: attachments = [], isLoading } = useAttachments("estimate", estimateId);
  const upload = useUploadAttachment("estimate", estimateId);
  const remove = useDeleteAttachment("estimate", estimateId);
  const download = useDownloadAttachment();
  const [dragging, setDragging] = useState(false);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const results = await upload.mutateAsync(list);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) toast.error(`${failed.length} file(s) failed to upload`);
    else toast.success(`${list.length} file(s) uploaded`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragging(false);
          await handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging
            ? "border-brand-400 bg-brand-50"
            : "border-slate-200 bg-white hover:border-slate-300"
        )}
      >
        <Upload className={cn("mx-auto h-8 w-8 mb-3", dragging ? "text-brand-400" : "text-slate-300")} />
        <p className="text-sm font-medium text-slate-600 mb-1">
          {dragging ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="text-xs text-slate-400 mb-3">or</p>
        <label className="cursor-pointer">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Paperclip className="h-3.5 w-3.5" /> Browse files
          </span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
          />
        </label>
        {upload.isPending && (
          <p className="mt-3 text-xs text-slate-400">Uploading…</p>
        )}
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="text-xs text-slate-400 text-center py-4">Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-2">No attachments yet</div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm divide-y">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 group">
              <Paperclip className="h-4 w-4 text-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{a.fileName}</p>
                <p className="text-xs text-slate-400">
                  {formatBytes(a.fileSize)} · {a.uploadedByName} · {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => download.mutate({ storagePath: a.storagePath, fileName: a.fileName })}
                  className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${a.fileName}?`)) return;
                    await remove.mutateAsync({ id: a.id, storagePath: a.storagePath });
                    toast.success("Attachment removed");
                  }}
                  className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EstimateVersionCard ────────────────────────────────────────────────────────

function EstimateVersionCard({ version }: { version: EstimateVersion }) {
  const [expanded, setExpanded] = useState(false);
  const { snapshot } = version;
  const sentDate = new Date(version.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">
            Version {version.versionNumber}
          </span>
          <span className="text-xs text-slate-400">{sentDate}</span>
          {version.sentToEmail && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
              Sent to {version.sentToEmail}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">
            {formatCurrency(snapshot.totalCents)}
          </span>
          <span className={cn("text-xs text-slate-400 transition-transform", expanded && "rotate-180")}>
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b">
                <th className="pb-1.5 pr-3 font-medium">Service</th>
                <th className="pb-1.5 pr-3 font-medium text-right">Qty</th>
                <th className="pb-1.5 pr-3 font-medium">Unit</th>
                <th className="pb-1.5 pr-3 font-medium text-right">Visits</th>
                <th className="pb-1.5 pr-3 font-medium text-right">Rate</th>
                <th className="pb-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.lineItems.map((li) => {
                if (li.rowType === "section") {
                  return (
                    <tr key={li.id} className="bg-slate-50">
                      <td colSpan={6} className="py-1.5 pr-3 font-semibold text-slate-600 uppercase tracking-wide text-[10px]">
                        {li.sectionName ?? "Section"}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 text-slate-800">
                      <div>{li.serviceName ?? "—"}</div>
                      {li.estimateDesc && (
                        <div className="text-[10px] text-slate-400">{stripHtml(li.estimateDesc)}</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{li.qty}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{li.unitType ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{li.visits}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{formatCurrency(li.rateCents)}</td>
                    <td className="py-1.5 text-right font-medium text-slate-800">{formatCurrency(li.totalCents)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={5} className="pt-2 text-right text-slate-500 font-medium pr-3">Total</td>
                <td className="pt-2 text-right font-semibold text-slate-800">{formatCurrency(snapshot.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

interface Props {
  estimateId: string;
  onClose?: () => void;
  /** Rendered inside a narrower side panel (sheet) — stack the header form to a single column instead of two. */
  compact?: boolean;
}

export function EstimateDetail({ estimateId, onClose, compact = false }: Props) {
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canSend = can("estimate_send");
  const searchParams = useSearchParams();
  const backClientId = searchParams.get("clientId");
  const qc = useQueryClient();
  const { data: estimate, isLoading } = useEstimate(estimateId);
  const { data: templates } = useEstimateTemplates();
  const { data: clients }   = useClients();
  const { data: employees } = useSelectableEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep);
  const { mutateAsync: updateEstimate } = useUpdateEstimate();
  const { mutateAsync: updateStage } = useUpdateEstimateStage();
  const { mutateAsync: saveFinancials } = useSaveEstimateFinancials();
  const { data: overheadSettings } = useOverheadSettings();
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);
  const { data: crmServices } = useCRMServices();
  const { mutateAsync: upsertLineItem } = useUpsertLineItem();
  const { mutateAsync: createInvoice, isPending: creatingInvoice } = useCreateInvoiceFromEstimate();
  const { data: changeRequests } = useEstimateChangeRequests(estimateId);
  const { mutateAsync: resolveChangeRequest } = useResolveChangeRequest();
  const openChangeRequests = (changeRequests ?? []).filter((r) => r.status === "open");


  const { data: shareTokens = [] } = useEstimateShareTokens(estimate?.id ?? "");
  const { data: versions = [] } = useEstimateVersions(estimate?.id ?? "");
  const { data: dbStages = [], isLoading: stagesLoading } = useEstimateStages();
  const seedStages = useSeedDefaultStages();

  useEffect(() => {
    if (!stagesLoading && dbStages.length === 0) {
      seedStages.mutate(undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagesLoading, dbStages.length]);

  const stageColor = (key: string) => DEFAULT_STAGE_COLORS[key] ?? "bg-slate-100 text-slate-600";
  const stageName  = (key: string) => dbStages.find((s: DBEstimateStage) => s.stageKey === key)?.name
    ?? DEFAULT_STAGE_LIST.find((s) => s.stageKey === key)?.name ?? key;
  const stageList  = dbStages.length > 0
    ? dbStages.map((s: DBEstimateStage) => ({ stageKey: s.stageKey, name: s.name }))
    : DEFAULT_STAGE_LIST;

  const [activeTab,        setActiveTab]        = useState<Tab>("details");
  const [lineItemFilter,   setLineItemFilter]   = useState<LineItemStatus | "all">("all");
  const [saving,           setSaving]           = useState(false);
  const [recalcPending,    setRecalcPending]    = useState(false);
  const [headerEdits,      setHeaderEdits]      = useState<Record<string, string | boolean | number | null>>({});
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [wonLostDialog, setWonLostDialog] = useState<"accepted" | "lost" | null>(null);
  const [rateIncreaseOpen, setRateIncreaseOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<string[]>([]);

  // ── Approval gate ────────────────────────────────────────────────────────
  const { data: estimateApprovalFlow } = useApprovalFlow("crm_estimate");
  const { mutate: submitForApproval, isPending: submittingForApproval } = useSubmitForApproval();
  const hasApprovalGate = !!estimateApprovalFlow && estimateApprovalFlow.steps.length > 0;

  function handleSendClick() {
    if (!estimate) return;
    if (estimate.approvalStatus === "pending") return; // chain is showing; nothing to do here

    if (estimate.approvalStatus === "not_required" && hasApprovalGate) {
      submitForApproval(
        { entityId: estimate.id, entityType: "crm_estimate", grandTotalCents: estimate.totalCents },
        {
          onSuccess: (result) => {
            // No steps applied to this amount (or admin bypass) — proceed straight to send.
            if (result?.autoApproved) setSendDialogOpen(true);
          },
        }
      );
      return;
    }

    if (estimate.approvalStatus === "rejected") {
      submitForApproval({ entityId: estimate.id, entityType: "crm_estimate", grandTotalCents: estimate.totalCents });
      return;
    }

    // 'not_required' with no gate configured, or already 'approved'
    setSendDialogOpen(true);
  }

  function patchHeader(key: string, val: string | boolean | number | null) {
    setHeaderEdits((p) => ({ ...p, [key]: val }));
  }

  // Accepts an explicit patch for callers that fire save in the same tick as
  // patchHeader (e.g. Select onValueChange) — headerEdits state hasn't
  // re-rendered yet at that point, so reading it here would miss the just-set value.
  async function saveHeader(explicitPatch?: Record<string, string | boolean | number | null>) {
    const patch = explicitPatch ?? headerEdits;
    if (!estimate || Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      await updateEstimate({ id: estimate.id, patch });
      setHeaderEdits({});
      toast.success("Saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStage(stage: EstimateStage, reason?: string) {
    if (!estimate) return;
    try {
      await updateStage({ id: estimate.id, stage, reason });
      toast.success(`Marked as ${stageName(stage)}`);
    } catch {
      toast.error("Failed to update stage");
    }
  }

  // Final authoritative recalc after a batch of concurrent line-item upserts.
  // Each upsert already triggers its own recalc, but concurrent writes can race
  // each other's recalc reads — this runs once all of them have fully settled
  // (write + their own recalc) so it sees every committed change.
  async function refreshEstimateTotals() {
    if (!estimate) return;
    await recalcEstimateTotals(estimate.id);
    // Concurrent per-item upserts each invalidate the detail query too, which can
    // kick off overlapping refetches — a slow one of those can resolve after this
    // point and clobber the cache with pre-recalc data. Cancel any in-flight fetch
    // for this key and force a fresh, awaited one so the grid reflects this recalc.
    await qc.cancelQueries({ queryKey: ["estimates", "detail", estimate.id] });
    await qc.refetchQueries({ queryKey: ["estimates", "detail", estimate.id] });
    qc.invalidateQueries({ queryKey: ["estimates"] });
  }

  async function handleRateIncrease(amount: number, isPercent: boolean) {
    if (!estimate) return;
    const affected = (estimate.lineItems ?? []).filter(
      (li) => !li.deletedAt && selectedLineItemIds.includes(li.id)
    );
    setRateIncreaseOpen(false);
    try {
      await Promise.all(
        affected.map((li) => {
          const applyIncrease = (rate: number) =>
            Math.max(0, isPercent ? Math.round(rate * (1 + amount / 100)) : rate + Math.round(amount * 100));
          const newRate = applyIncrease(li.rateCents);
          // computeLineItem prices off `adjRateCents ?? rateCents` — bumping
          // only rateCents was a no-op on any line using the Adj Rate
          // column, since the adjusted rate (now stale) still won and the
          // recomputed total never changed, even though the toast reported
          // success. Bump the adjusted rate by the same increase too.
          const newAdjRate = li.adjRateCents != null ? applyIncrease(li.adjRateCents) : null;
          const updated = computeLineItem({
            calcType: li.calcType,
            qty: li.qty,
            rateCents: newRate,
            visits: li.visits,
            budgetedHours: li.budgetedHours,
            costCents: li.costCents,
            adjRateCents: newAdjRate,
            unitType: li.unitType ?? undefined,
            productionRateSqftPerHr: li.productionRateSqftPerHr ?? undefined,
            budgetMethod: li.budgetMethod,
          }, breakevenRateCents);
          return upsertLineItem({
            estimateId: estimate.id,
            item: {
              id: li.id,
              rate_cents: newRate,
              ...(newAdjRate != null ? { adj_rate_cents: newAdjRate } : {}),
              total_cents: updated.totalCents,
              total_budgeted_hours: updated.totalBudgetedHours,
              budgeted_hours: updated.budgetedHours,
              cost_cents: updated.costCents,
              total_cost_cents: updated.totalCostCents,
              margin_bps: updated.marginBps,
              markup_bps: updated.markupBps,
            },
          });
        })
      );
      await refreshEstimateTotals();
      toast.success(`Rate updated on ${affected.length} line item${affected.length !== 1 ? "s" : ""}`);
      setSelectedLineItemIds([]);
    } catch {
      toast.error("Rate increase failed");
    }
  }

  // Manually marking a line item "won" doesn't automatically move the whole
  // estimate to Accepted — other items on the same estimate may still be
  // pending a decision. But leaving an estimate sitting in "sent"/"quote"
  // with won items on it is ambiguous, so nudge staff to make the call
  // explicitly rather than letting it happen silently.
  function promptMarkAcceptedIfWon(status: LineItemStatus) {
    if (!estimate || status !== "won" || estimate.stage === "accepted") return;
    toast("Mark this estimate as Accepted too?", {
      action: {
        label: "Mark Accepted",
        onClick: () => setWonLostDialog("accepted"),
      },
      duration: 8000,
    });
  }

  async function handleBulkStatus(status: LineItemStatus) {
    if (!estimate) return;
    const affected = (estimate.lineItems ?? []).filter(
      (li) => !li.deletedAt && selectedLineItemIds.includes(li.id)
    );
    setBulkStatusOpen(false);
    try {
      await Promise.all(
        affected.map((li) => upsertLineItem({ estimateId: estimate.id, item: { id: li.id, status } }))
      );
      await refreshEstimateTotals();
      toast.success(`Status updated on ${affected.length} line item${affected.length !== 1 ? "s" : ""}`);
      setSelectedLineItemIds([]);
      promptMarkAcceptedIfWon(status);
    } catch {
      toast.error("Status update failed");
    }
  }

  async function handleAIAddItems(items: AIDraftLineItem[]) {
    if (!estimate || !items.length) return;
    setSaving(true);
    try {
      const existingCount = (estimate.lineItems ?? []).filter((li) => !li.deletedAt).length;
      await Promise.all(
        items.map((item, idx) => {
          // Carry over the matched service's budget method / production rate
          // (same as EstimateLineItemsGrid's addService) so an AI-drafted item
          // for a production_rate service doesn't silently fall back to manual
          // budgeting with 0 budgeted hours.
          const matchedService = item.serviceId
            ? (crmServices ?? []).find((s) => s.id === item.serviceId)
            : undefined;
          const budgetMethod = matchedService?.budgetMethod ?? "manual";
          const productionRate = matchedService?.productionRateSqftPerHr ?? null;
          const computed = computeLineItem({
            calcType: 1,
            qty: item.qty,
            rateCents: item.rateCents,
            visits: item.visits,
            budgetedHours: 0,
            costCents: 0,
            adjRateCents: null,
            unitType: item.unitType,
            productionRateSqftPerHr: productionRate,
            budgetMethod,
          }, breakevenRateCents);
          return upsertLineItem({
            estimateId: estimate.id,
            item: {
              service_id: item.serviceId ?? null,
              service_name: item.serviceName,
              estimate_desc: item.estimateDesc || null,
              status: "quote",
              calc_type: 1,
              qty: item.qty,
              rate_cents: item.rateCents,
              visits: item.visits,
              cost_cents: computed.costCents,
              adj_rate_cents: null,
              sort_order: existingCount + idx,
              unit_type: item.unitType,
              production_rate_sqft_per_hr: productionRate,
              budget_method: budgetMethod,
              total_cents: computed.totalCents,
              budgeted_hours: computed.budgetedHours,
              total_budgeted_hours: computed.totalBudgetedHours,
              total_cost_cents: computed.totalCostCents,
              margin_bps: computed.marginBps,
              markup_bps: computed.markupBps,
            },
          });
        })
      );
      await refreshEstimateTotals();
      toast.success(`Added ${items.length} line item${items.length !== 1 ? "s" : ""} from AI draft`);
    } catch {
      toast.error("Failed to add AI-drafted items");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFinancials(overrides?: {
    taxRateBps?: number;
    overheadRateBps?: number;
    discountCents?: number;
    discountType?: DiscountType | null;
    discountValue?: number | null;
    appliedDiscountId?: string | null;
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
        discountType:       overrides && "discountType" in overrides       ? overrides.discountType       : estimate.discountType,
        discountValue:      overrides && "discountValue" in overrides      ? overrides.discountValue      : estimate.discountValue,
        appliedDiscountId:  overrides && "appliedDiscountId" in overrides  ? overrides.appliedDiscountId  : estimate.appliedDiscountId,
        // Per-cost-type overhead (crm_overhead_settings) takes priority over the
        // flat overheadRateBps once an org has actually configured it; otherwise
        // fall back to the existing flat-rate behavior.
        perTypeOverhead: overheadSettings && hasPerTypeOverhead(overheadSettings) ? overheadSettings : undefined,
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

  if (!permissionsLoading && !can("estimate_edit")) {
    return (
      <EmptyState
        icon={FileText}
        title="No access"
        description="You don't have permission to edit Estimates."
      />
    );
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (onClose) { onClose(); return; }
              if (backClientId) { router.push(`/crm/clients/${backClientId}`); return; }
              router.back();
            }}
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
                <Badge className={cn("text-[10px]", stageColor(effectiveStage))}>
                  {stageName(effectiveStage)}
                </Badge>
              </span>
              {estimate.reason && (effectiveStage === "accepted" || effectiveStage === "lost") && (
                <span className="ml-2 text-xs text-slate-500 font-normal">
                  · {estimate.reason}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              Code: {estimate.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 gap-y-2">
          <Button variant="outline" size="sm" className="h-8 text-xs"
            title="Mark this estimate's stage as Accepted — updates the estimate only, not individual line items"
            onClick={() => setWonLostDialog("accepted")}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-500" />Accepted
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            title="Mark this estimate's stage as Closed - Lost — updates the estimate only, not individual line items"
            onClick={() => setWonLostDialog("lost")}>
            <XCircle className="mr-1 h-3.5 w-3.5 text-red-400" />Lost
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            title="Mark this estimate's stage as Quote Ready — updates the estimate only, not individual line items"
            onClick={() => handleStage("quote")}>
            <FileText className="mr-1 h-3.5 w-3.5 text-blue-400" />Quote
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            title="Mark this estimate's stage as Draft — updates the estimate only, not individual line items"
            onClick={() => handleStage("draft")}>
            <Pencil className="mr-1 h-3.5 w-3.5 text-slate-400" />Draft
          </Button>
          {canSend && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              disabled={estimate.approvalStatus === "pending" || submittingForApproval}
              onClick={handleSendClick}>
              <Send className="mr-1 h-3.5 w-3.5 text-yellow-500" />
              {estimate.approvalStatus === "pending" ? "Awaiting Approval"
                : estimate.approvalStatus === "rejected" ? "Resubmit for Approval"
                : "Send"}
            </Button>
          )}
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
                  salesRepId: estimate.salesRepId,
                  description: estimate.description ?? `Invoice for estimate #${estimate.estimateNumber}`,
                  invoiceDate: today,
                  lineItems: (estimate.lineItems ?? [])
                    .filter((li) => !li.deletedAt && li.status !== "lost")
                    .map((li) => ({
                      name: li.serviceName ?? li.serviceId ?? "Service",
                      description: li.invoiceDesc ?? "",
                      qty: li.qty,
                      rateCents: li.rateCents,
                      totalCents: li.totalCents,
                      discountCents: li.discountCents,
                      discountType: li.discountType,
                      discountValue: li.discountValue,
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
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => window.open(`/api/crm/estimates/${estimate.id}/pdf`, "_blank")}
          >
            <Eye className="mr-1 h-3.5 w-3.5 text-slate-500" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={async () => {
              const win = window.open(`/api/crm/estimates/${estimate.id}/pdf`, "_blank");
              if (win) {
                win.addEventListener("load", () => win.print(), { once: true });
              }
            }}
          >
            <Printer className="mr-1 h-3.5 w-3.5 text-slate-500" />
            Print
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

      {estimate.approvalStatus !== "not_required" && (
        <div className="border-b bg-slate-50 px-6 py-3">
          <p className="mb-2 text-xs font-medium text-slate-500">
            Approval Chain
            {estimate.approvalStatus === "rejected" && (
              <span className="ml-2 font-semibold text-red-600">Rejected</span>
            )}
          </p>
          <ApprovalChain entityId={estimate.id} />
        </div>
      )}

      {/* ── tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b bg-white px-6">
        {(["details", "payment", "display", "notes", "photos", "attachments", "comments", "audit", "versions"] as Tab[]).map((t) => (
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
            {t === "audit" ? "Audit Trail"
              : t === "versions" ? `Versions${versions.length > 0 ? ` (${versions.length})` : ""}`
              : t === "payment" ? "Payment Plan"
              : t === "display" ? "Client View"
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── body ────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:items-start gap-4 overflow-auto p-6">

        {/* ── left ── */}
        <div className="flex flex-1 flex-col gap-4 min-w-0 pb-3">

          {activeTab === "details" && (
            <>
              {/* Open change requests from the client */}
              {openChangeRequests.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 divide-y divide-amber-200 shrink-0">
                  {openChangeRequests.map((cr) => (
                    <div key={cr.id} className="flex items-start gap-3 p-3">
                      <MessageSquarePlus className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-amber-900">
                          <span className="font-semibold">{cr.requesterName}</span> requested changes:
                        </p>
                        <p className="text-sm text-amber-800 mt-0.5">{cr.message}</p>
                        <p className="text-xs text-amber-600 mt-1">
                          {new Date(cr.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0 bg-white"
                        onClick={() => resolveChangeRequest({ id: cr.id, estimateId })}
                      >
                        Mark Resolved
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Client info card + header form */}
              <div className="rounded-lg border bg-white shadow-sm overflow-hidden shrink-0">
                <div className={cn("flex flex-col gap-0 sm:flex-row", compact && "flex-col")}>

                  {/* Client info card */}
                  <div className={cn(
                    "shrink-0 bg-slate-50 p-4 flex flex-col gap-2",
                    compact ? "w-full border-b" : "w-full border-b sm:w-56 sm:border-b-0 sm:border-r"
                  )}>
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
                  <div className="flex-1 p-4 min-w-0">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">

                      {/* Left column */}
                      <div className="flex flex-col gap-3 min-w-0">
                        <FieldRow label="Description">
                          <Input
                            value={(headerEdits.description as string) ?? estimate.description}
                            onChange={(e) => patchHeader("description", e.target.value)}
                            onBlur={() => saveHeader()}
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
                          <Select
                            value={(headerEdits.sales_rep_id as string) ?? (estimate.salesRepId ?? "")}
                            onValueChange={(v) => { patchHeader("sales_rep_id", v); saveHeader({ ...headerEdits, sales_rep_id: v }); }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Assign sales rep…" />
                            </SelectTrigger>
                            <SelectContent>
                              {salesReps.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.firstName} {e.lastName}
                                </SelectItem>
                              ))}
                              {estimate.salesRepId && !salesReps.some((e) => e.id === estimate.salesRepId) && (
                                <SelectItem value={estimate.salesRepId}>
                                  {estimate.salesRepName ?? "Unknown"}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Stage" title="Where this estimate is in the pipeline — sets the estimate's overall status, not each line item's individual status">
                          <Select
                            value={effectiveStage}
                            onValueChange={(v) => {
                              const s = v as EstimateStage;
                              if (s === "accepted" || s === "lost") {
                                setWonLostDialog(s);
                              } else {
                                patchHeader("stage", s);
                                handleStage(s);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stageList.map((s) => (
                                <SelectItem key={s.stageKey} value={s.stageKey as EstimateStage}>{s.name}</SelectItem>
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
                      <div className="flex flex-col gap-3 min-w-0">
                        <FieldRow label="Estimate Date">
                          <Input
                            type="date"
                            value={(headerEdits.estimate_date as string) ?? estimate.estimateDate}
                            onChange={(e) => patchHeader("estimate_date", e.target.value)}
                            onBlur={() => saveHeader()}
                            className="h-8 w-36"
                          />
                        </FieldRow>
                        <FieldRow label="Valid Until">
                          <Input
                            type="date"
                            value={(headerEdits.valid_until_date as string) ?? (estimate.validUntilDate ?? "")}
                            onChange={(e) => patchHeader("valid_until_date", e.target.value)}
                            onBlur={() => saveHeader()}
                            className="h-8 w-36"
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
                              onBlur={() => saveHeader()}
                              className="h-8 w-20"
                            />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                        </FieldRow>
                        <FieldRow label="PO Number">
                          <Input
                            value={(headerEdits.po_number as string) ?? (estimate.poNumber ?? "")}
                            onChange={(e) => patchHeader("po_number", e.target.value)}
                            onBlur={() => saveHeader()}
                            className="h-8"
                            placeholder="PO Number"
                          />
                        </FieldRow>
                        <FieldRow label="Work Order #">
                          <Input
                            value={(headerEdits.work_order_number as string) ?? (estimate.workOrderNumber ?? "")}
                            onChange={(e) => patchHeader("work_order_number", e.target.value)}
                            onBlur={() => saveHeader()}
                            className="h-8"
                            placeholder="Work Order Number"
                          />
                        </FieldRow>
                        <FieldRow label="Payment Terms">
                          <Select
                            value={(headerEdits.payment_terms as string) ?? (estimate.paymentTerms ?? "org_default")}
                            onValueChange={(v) => {
                              const val = v === "org_default" ? null : v;
                              patchHeader("payment_terms", val);
                              saveHeader({ ...headerEdits, payment_terms: val });
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="org_default">Use org default</SelectItem>
                              {BILLING_TERMS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Tiered Proposal">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 h-8">
                              <Checkbox
                                checked={
                                  headerEdits.tiers_enabled !== undefined
                                    ? Boolean(headerEdits.tiers_enabled)
                                    : estimate.tiersEnabled
                                }
                                onCheckedChange={(v) => {
                                  patchHeader("tiers_enabled", Boolean(v));
                                  saveHeader();
                                }}
                              />
                              <span className="text-xs text-slate-500">Enable Good/Better/Best tiers</span>
                            </div>
                            {(headerEdits.tiers_enabled !== undefined
                              ? Boolean(headerEdits.tiers_enabled)
                              : estimate.tiersEnabled) && (
                              <div className="flex gap-2 mt-1">
                                {(["basic", "standard", "premium"] as const).map((t) => (
                                  <Input
                                    key={t}
                                    value={
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      (headerEdits.tier_labels as any)?.[t] ?? estimate.tierLabels[t]
                                    }
                                    onChange={(e) =>
                                      patchHeader("tier_labels", {
                                        ...estimate.tierLabels,
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        ...(headerEdits.tier_labels as any ?? {}),
                                        [t]: e.target.value,
                                      })
                                    }
                                    onBlur={() => saveHeader()}
                                    className="h-7 text-xs"
                                    placeholder={t.charAt(0).toUpperCase() + t.slice(1)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </FieldRow>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Proposal view tracking strip */}
              {shareTokens.length > 0 && (() => {
                const totalViews = shareTokens.reduce((s, t) => s + t.viewCount, 0);
                const firstViewed = shareTokens
                  .map((t) => t.firstViewedAt)
                  .filter(Boolean)
                  .sort()[0];
                const accepted = shareTokens.find((t) => t.acceptedAt);
                return (
                  <div className="flex items-center gap-3 rounded-md border bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Send className="h-3 w-3 text-slate-400" />
                      <span>{shareTokens.length} link{shareTokens.length !== 1 ? "s" : ""} sent</span>
                    </div>
                    {totalViews > 0 ? (
                      <div className="flex items-center gap-1 text-brand-600 font-medium">
                        <Eye className="h-3 w-3" />
                        <span>Viewed {totalViews} time{totalViews !== 1 ? "s" : ""}</span>
                        {firstViewed && (
                          <span className="font-normal text-slate-400">
                            — first opened {new Date(firstViewed).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="italic text-slate-400">Not yet opened</span>
                    )}
                    {accepted && (
                      <div className="flex items-center gap-1 text-green-600 font-medium ml-auto">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Accepted by {accepted.acceptedByName}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Templates + rate increase toolbar */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setAiDraftOpen(true)}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5 text-brand-500" />
                  Draft with AI
                </Button>
                <Select
                  onValueChange={async (templateId) => {
                    if (!estimate || !templateId) return;
                    const tpl = (templates ?? []).find((t) => t.id === templateId);
                    if (!tpl) return;
                    if (!tpl.items?.length && !tpl.displaySettings) { toast.info("Template has no items"); return; }
                    setSaving(true);
                    try {
                      const existingCount = (estimate.lineItems ?? []).filter((li) => !li.deletedAt).length;
                      await Promise.all([
                        ...(tpl.items ?? []).map((item, idx) => {
                          // Carry over the matched service's budget method / production
                          // rate so a production_rate service applied via template doesn't
                          // silently fall back to manual budgeting with 0 budgeted hours.
                          const matchedService = item.serviceId
                            ? (crmServices ?? []).find((s) => s.id === item.serviceId)
                            : undefined;
                          const budgetMethod = matchedService?.budgetMethod ?? "manual";
                          const productionRate = matchedService?.productionRateSqftPerHr ?? null;
                          const computed = computeLineItem({
                            calcType: item.calcType,
                            qty: item.qty,
                            unitType: item.unitType,
                            rateCents: item.rateCents,
                            visits: item.visits,
                            budgetedHours: item.budgetedHours,
                            costCents: 0,
                            adjRateCents: null,
                            productionRateSqftPerHr: productionRate,
                            budgetMethod,
                          }, breakevenRateCents);
                          return upsertLineItem({
                            estimateId: estimate.id,
                            item: {
                              service_id: item.serviceId,
                              service_name: item.serviceName,
                              status: "quote",
                              calc_type: item.calcType,
                              qty: item.qty,
                              unit_type: item.unitType,
                              rate_cents: item.rateCents,
                              visits: item.visits,
                              cost_cents: computed.costCents,
                              adj_rate_cents: null,
                              sort_order: existingCount + idx,
                              production_rate_sqft_per_hr: productionRate,
                              budget_method: budgetMethod,
                              total_cents: computed.totalCents,
                              budgeted_hours: computed.budgetedHours,
                              total_budgeted_hours: computed.totalBudgetedHours,
                              total_cost_cents: computed.totalCostCents,
                              margin_bps: computed.marginBps,
                              markup_bps: computed.markupBps,
                              discount_cents: item.discountCents,
                              discount_type: item.discountType,
                              discount_value: item.discountValue,
                              applied_discount_id: item.appliedDiscountId,
                            },
                          });
                        }),
                        ...(tpl.displaySettings
                          ? [updateEstimate({ id: estimate.id, patch: { display_settings: tpl.displaySettings } })]
                          : []),
                      ]);
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
                {selectedLineItemIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setRateIncreaseOpen(true)}
                  >
                    <TrendingUp className="mr-1 h-3.5 w-3.5" />
                    Rate Increase ({selectedLineItemIds.length})
                  </Button>
                )}
                {selectedLineItemIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setBulkStatusOpen(true)}
                  >
                    Change Status ({selectedLineItemIds.length})
                  </Button>
                )}
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
                      title={t.value === "all" ? "Show all line items" : `Filter to line items whose own status is "${t.label}" — separate from the estimate's overall stage above`}
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
                selectedIds={selectedLineItemIds}
                onSelectionChange={setSelectedLineItemIds}
                tiersEnabled={estimate.tiersEnabled}
                onItemStatusChange={promptMarkAcceptedIfWon}
              />

              {/* Direct costs */}
              <EstimateDirectCostsGrid
                estimateId={estimate.id}
                items={estimate.directCosts ?? []}
              />
            </>
          )}

          {activeTab === "payment" && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-x-10 gap-y-3 max-w-2xl sm:grid-cols-2">
                <FieldRow label="Payment Plan" title="How the client will pay: a set number of monthly installments, or custom milestone payments">
                  <Select
                    value={(headerEdits.payment_plan_type as string) ?? estimate.paymentPlanType}
                    onValueChange={(v) => { patchHeader("payment_plan_type", v); saveHeader({ ...headerEdits, payment_plan_type: v }); }}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="installments">Monthly Installments</SelectItem>
                      <SelectItem value="milestones">Milestones</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                {((headerEdits.payment_plan_type as string) ?? estimate.paymentPlanType) === "installments" && (
                  <>
                    <FieldRow label="# of Installments" title="How many equal monthly payments to split the total into, after the deposit">
                      <div className="flex flex-col gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={(headerEdits.num_installments as number) ?? estimate.numInstallments}
                          onChange={(e) => patchHeader("num_installments", Number(e.target.value))}
                          onBlur={() => saveHeader()}
                          className="h-8 w-20"
                        />
                        {(() => {
                          const n = (headerEdits.num_installments as number) ?? estimate.numInstallments;
                          const deposit = (headerEdits.deposit_required_cents as number) ?? estimate.depositRequiredCents;
                          const day = (headerEdits.installment_day_of_month as number | null | undefined) ?? estimate.installmentDayOfMonth;
                          const schedule = computeInstallmentSchedule(estimate.totalCents, deposit, n, estimate.estimateDate, day);
                          if (schedule.length === 0) return null;
                          return (
                            <p className="text-[10px] text-slate-400">
                              {schedule.length} × {formatCurrency(schedule[0].amountCents)}/mo starting {new Date(schedule[0].dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          );
                        })()}
                      </div>
                    </FieldRow>
                    <FieldRow label="Payment Day" title="Day of the month each installment is due. Leave blank to use the same day as the estimate date">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={
                            (headerEdits.installment_day_of_month as number | null | undefined) !== undefined
                              ? String((headerEdits.installment_day_of_month as number | null) ?? "")
                              : String(estimate.installmentDayOfMonth ?? "")
                          }
                          onChange={(e) =>
                            patchHeader("installment_day_of_month", e.target.value === "" ? null : Number(e.target.value))
                          }
                          onBlur={() => saveHeader()}
                          className="h-8 w-20"
                          placeholder="—"
                        />
                        <span className="text-[10px] text-slate-400">Blank = same day as estimate date</span>
                      </div>
                    </FieldRow>
                  </>
                )}
                <FieldRow label="Deposit Required" title="Upfront amount due before work begins, subtracted from the total before splitting into installments">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">$</span>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={
                          headerEdits.deposit_required_cents !== undefined
                            ? ((headerEdits.deposit_required_cents as number) / 100).toFixed(2)
                            : (estimate.depositRequiredCents / 100).toFixed(2)
                        }
                        onChange={(e) =>
                          patchHeader("deposit_required_cents", Math.round(Number(e.target.value) * 100))
                        }
                        onBlur={() => saveHeader()}
                        className="h-8 w-28"
                        placeholder="0"
                      />
                    </div>
                    {estimate.depositCollectedCents > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        Collected {formatCurrency(estimate.depositCollectedCents)}
                        {estimate.depositMethod ? ` via ${estimate.depositMethod}` : ""}
                        {estimate.depositCollectedAt
                          ? ` on ${new Date(estimate.depositCollectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                          : ""}
                      </span>
                    )}
                  </div>
                </FieldRow>
              </div>
              {((headerEdits.payment_plan_type as string) ?? estimate.paymentPlanType) === "milestones" && (
                <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
                  <Label className="text-xs font-medium text-slate-600">Milestones</Label>
                  <EstimateMilestonesEditor
                    estimateId={estimate.id}
                    clientId={estimate.clientId}
                    salesRepId={estimate.salesRepId}
                    totalCents={estimate.totalCents}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "display" && (
            <EstimateDisplaySettingsPanel
              settings={
                (headerEdits.display_settings as unknown as DisplaySettings | undefined) ??
                estimate.displaySettings ??
                DEFAULT_DISPLAY_SETTINGS
              }
              onChange={(next) => {
                patchHeader("display_settings", { ...next } as unknown as boolean);
                saveHeader({ ...headerEdits, display_settings: next as unknown as boolean });
              }}
            />
          )}

          {activeTab === "notes" && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <textarea
                value={(headerEdits.notes as string) ?? (estimate.notes ?? "")}
                onChange={(e) => patchHeader("notes", e.target.value)}
                onBlur={() => saveHeader()}
                rows={10}
                placeholder="Add notes…"
                className="w-full rounded border border-slate-200 p-2 text-sm focus:border-brand-400 focus:outline-none resize-none"
              />
            </div>
          )}

          {activeTab === "photos" && (
            <EstimatePhotosTab estimateId={estimate.id} />
          )}

          {activeTab === "attachments" && (
            <EstimateAttachmentsTab estimateId={estimate.id} />
          )}

          {activeTab === "comments" && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <CommentsSection recordType="crm_estimate" recordId={estimate.id} />
            </div>
          )}

          {activeTab === "audit" && (
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <AuditTrailTab recordType="estimate" recordId={estimate.id} />
            </div>
          )}

          {activeTab === "versions" && (
            <div className="flex flex-col gap-3">
              {versions.length === 0 ? (
                <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-400">
                  No versions yet — a snapshot is saved each time the estimate is sent.
                </div>
              ) : versions.map((v) => (
                <EstimateVersionCard key={v.id} version={v} />
              ))}
            </div>
          )}
        </div>

        {/* ── right: summary panel ── */}
        <div className="w-full md:w-64 md:shrink-0 pb-3">
          <EstimateSummaryPanel
            estimate={estimate}
            onRecalculate={handleSaveFinancials}
            recalcPending={recalcPending}
          />
        </div>
      </div>

      <AIDraftDialog
        estimateId={estimate.id}
        open={aiDraftOpen}
        onOpenChange={setAiDraftOpen}
        onAddItems={handleAIAddItems}
      />

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

      {wonLostDialog && (
        <WonLostReasonDialog
          stage={wonLostDialog}
          open={!!wonLostDialog}
          onConfirm={(reason) => {
            const stage = wonLostDialog;
            setWonLostDialog(null);
            handleStage(stage, reason);
            if (stage === "accepted") setConvertDialogOpen(true);
          }}
          onCancel={() => setWonLostDialog(null)}
        />
      )}

      <RateIncreaseDialog
        selectedCount={selectedLineItemIds.length}
        open={rateIncreaseOpen}
        onApply={(amount, isPercent) => {
          setRateIncreaseOpen(false);
          handleRateIncrease(amount, isPercent);
        }}
        onCancel={() => setRateIncreaseOpen(false)}
      />

      <BulkStatusDialog
        selectedCount={selectedLineItemIds.length}
        open={bulkStatusOpen}
        onApply={handleBulkStatus}
        onCancel={() => setBulkStatusOpen(false)}
      />

      <SendEstimateDialog
        estimateId={estimate.id}
        estimateNumber={estimate.estimateNumber}
        clientName={estimate.clientName ?? null}
        clientEmail={estimate.clientEmail ?? null}
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        onSent={() => {
          setSendDialogOpen(false);
          handleStage("sent");
        }}
      />
    </div>
  );
}

// ── helper ────────────────────────────────────────────────────────────────────

function FieldRow({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Label className="w-32 shrink-0 text-slate-500 text-xs" title={title}>{label}</Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
