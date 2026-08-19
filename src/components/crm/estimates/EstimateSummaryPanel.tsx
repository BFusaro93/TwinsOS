"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { bpsToPercent } from "@/lib/estimate-calc";
import { useDiscounts } from "@/lib/hooks/use-crm-discounts";
import { useOverheadSettings } from "@/lib/hooks/use-overhead-settings";
import { hasPerTypeOverhead } from "@/lib/estimate-calc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Estimate } from "@/types/crm-estimates";
import type { DiscountType } from "@/types/crm-discounts";

interface RecalcParams {
  taxRateBps: number;
  overheadRateBps: number;
  discountCents: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  appliedDiscountId: string | null;
}

interface Props {
  estimate: Estimate;
  onRecalculate: (params: RecalcParams) => Promise<void>;
  recalcPending?: boolean;
}

function PnlRow({
  label,
  cents,
  bps,
  bold,
  negative,
}: {
  label: string;
  cents: number;
  bps?: number;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-2 py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600 leading-tight">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`w-16 text-right tabular-nums ${negative && cents > 0 ? "text-red-500" : ""}`}>
          {negative && cents > 0 ? "-" : ""}{formatCurrency(cents)}
        </span>
        {bps !== undefined && (
          <span className="w-10 text-right tabular-nums text-slate-400 text-[10px]">
            {bpsToPercent(bps)}
          </span>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-slate-200" />;
}

function RateRow({
  label,
  value,
  onChange,
  onBlur,
  suffix = "%",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          step="0.1"
          min="0"
          className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:border-brand-400 focus:outline-none"
        />
        <span className="text-xs text-slate-400">{suffix}</span>
      </div>
    </div>
  );
}

export function EstimateSummaryPanel({ estimate, onRecalculate, recalcPending }: Props) {
  // estimate.lineItems comes straight from the raw estimate_line_items
  // select with no filter — it includes every soft-deleted and "lost"
  // historical row ever created on this estimate. recalcEstimateTotals
  // (the server-authoritative total) filters those out
  // (.neq("status", "lost").is("deleted_at", null)); this panel re-derives
  // its own cost breakdown client-side and must apply the identical filter
  // or its rows silently include stale/deleted totals the server total
  // never counted.
  const lineItems   = (estimate.lineItems ?? []).filter((li) => !li.deletedAt && li.status !== "lost");
  const directCosts = estimate.directCosts ?? [];
  const { data: discounts = [] } = useDiscounts();
  const activeDiscounts = discounts.filter((d) => d.isActive);
  const { data: overheadSettings } = useOverheadSettings();
  const perTypeOverheadActive = !!overheadSettings && hasPerTypeOverhead(overheadSettings);

  // Editable financial settings — initialized from estimate
  const [taxRateStr,      setTaxRateStr]      = useState(String((estimate.taxRateBps / 100).toFixed(2)));
  const [overheadRateStr, setOverheadRateStr] = useState(String((estimate.overheadRateBps / 100).toFixed(2)));
  const [discountStr,     setDiscountStr]     = useState(String((estimate.discountCents / 100).toFixed(2)));
  const [discountType,       setDiscountType]       = useState<DiscountType | null>(estimate.discountType);
  const [discountValue,      setDiscountValue]      = useState<number | null>(estimate.discountValue);
  const [appliedDiscountId,  setAppliedDiscountId]  = useState<string | null>(estimate.appliedDiscountId);

  async function handleRecalc(
    discountOverrideStr?: string,
    discountOverride?: { type: DiscountType | null; value: number | null; appliedId: string | null }
  ) {
    const taxRateBps      = Math.round((parseFloat(taxRateStr) || 0) * 100);
    const overheadRateBps = Math.round((parseFloat(overheadRateStr) || 0) * 100);
    const discountCents   = Math.round((parseFloat(discountOverrideStr ?? discountStr) || 0) * 100);
    await onRecalculate({
      taxRateBps,
      overheadRateBps,
      discountCents,
      discountType: discountOverride ? discountOverride.type : discountType,
      discountValue: discountOverride ? discountOverride.value : discountValue,
      appliedDiscountId: discountOverride ? discountOverride.appliedId : appliedDiscountId,
    });
  }

  // A manual edit to the raw $ amount decouples it from whatever saved
  // discount preset produced it — treat it as a plain flat amount.
  function handleDiscountStrChange(v: string) {
    setDiscountStr(v);
    setDiscountType("flat");
    setDiscountValue(Math.round((parseFloat(v) || 0) * 100));
    setAppliedDiscountId(null);
  }

  function clearDiscount() {
    setDiscountStr("0.00");
    setDiscountType(null);
    setDiscountValue(null);
    setAppliedDiscountId(null);
    void handleRecalc("0.00", { type: null, value: null, appliedId: null });
  }

  function applyNamedDiscount(discountId: string) {
    if (!discountId || discountId === "custom") return;
    const d = activeDiscounts.find((item) => item.id === discountId);
    if (!d) return;
    const cents = d.discountType === "percent"
      ? Math.round(estimate.subtotalCents * ((d.percentBps ?? 0) / 10000))
      : (d.flatCents ?? 0);
    const value = d.discountType === "percent" ? (d.percentBps ?? 0) : (d.flatCents ?? 0);
    const str = (cents / 100).toFixed(2);
    setDiscountStr(str);
    setDiscountType(d.discountType);
    setDiscountValue(value);
    setAppliedDiscountId(d.id);
    void handleRecalc(str, { type: d.discountType, value, appliedId: d.id });
  }

  // Cost breakdown by type — direct costs plus line items' own modeled labor
  // cost (budgetedHours × breakeven rate, computed per computeLineItem). The
  // server's grossProfitCents = revenueCents - totalCostCents(line items) -
  // directTotal, so unless line-item cost is folded into a visible row here
  // too, these "Costs" rows sum to less than what was actually subtracted and
  // the P&L block doesn't foot against estimate.grossProfitCents below it.
  const costByType: Record<string, number> = {
    labor: 0, sub_contract: 0, service: 0,
    product_material: 0, asset_equipment: 0, other: 0,
  };
  directCosts.forEach((dc) => {
    costByType[dc.costType] = (costByType[dc.costType] ?? 0) + dc.totalCents;
  });
  costByType.labor += lineItems.reduce((s, li) => s + li.totalCostCents, 0);

  const totalDirectCents  = directCosts.reduce((s, dc) => s + dc.totalCents, 0);
  const totalCostCents    = lineItems.reduce((s, li) => s + li.totalCostCents, 0) + totalDirectCents;
  const rev               = estimate.revenueCents;
  // Revenue is already net of BOTH discount sources (recalcEstimateTotals
  // subtracts each line item's discount_cents before summing to subtotal,
  // then subtracts the estimate-level discount on top) — so this line's
  // total must include line-item discounts too, or it undercounts what was
  // actually subtracted to produce `rev`.
  const totalDiscountCents = estimate.discountCents + lineItems.reduce((s, li) => s + li.discountCents, 0);

  function pct(cents: number) {
    return rev > 0 ? Math.round((cents / rev) * 10000) : 0;
  }

  const grossBps = rev > 0
    ? Math.round((estimate.grossProfitCents / rev) * 10000)
    : 0;
  const netBps = rev > 0
    ? Math.round((estimate.netProfitCents / rev) * 10000)
    : 0;

  const revenueManHr = estimate.totalBudgetedHours > 0
    ? (rev / estimate.totalBudgetedHours / 100)
    : 0;
  const netManHr = estimate.totalBudgetedHours > 0
    ? (estimate.netProfitCents / estimate.totalBudgetedHours / 100)
    : 0;

  return (
    <div className="flex flex-col gap-3">

      {/* Financial settings */}
      <div className="rounded-lg border bg-white p-4 text-xs shadow-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Financial Settings
        </p>
        <RateRow
          label="Tax Rate"
          value={taxRateStr}
          onChange={setTaxRateStr}
          onBlur={() => handleRecalc()}
        />
        <RateRow
          label="Overhead Rate"
          value={overheadRateStr}
          onChange={setOverheadRateStr}
          onBlur={() => handleRecalc()}
        />
        {perTypeOverheadActive && (
          <p className="mb-1 text-[10px] leading-tight text-slate-400">
            Per-cost-type overhead is configured in Settings — this flat rate is ignored while that's active.
          </p>
        )}
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <RateRow
              label="Discount"
              value={discountStr}
              onChange={handleDiscountStrChange}
              onBlur={() => handleRecalc()}
              suffix="$"
            />
          </div>
          {(estimate.discountCents > 0 || appliedDiscountId) && (
            <button
              type="button"
              onClick={clearDiscount}
              title="Remove discount"
              className="rounded p-0.5 text-slate-400 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {activeDiscounts.length > 0 && (
          <div className="mt-1.5">
            <Select
              value={appliedDiscountId ?? "__none__"}
              onValueChange={(v) => (v === "__none__" ? clearDiscount() : applyNamedDiscount(v))}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Apply a saved discount…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-slate-400">
                  — None —
                </SelectItem>
                {activeDiscounts.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    {d.name} — {d.discountType === "percent"
                      ? `${((d.percentBps ?? 0) / 100).toFixed(2)}%`
                      : formatCurrency(d.flatCents ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {recalcPending && (
          <p className="mt-1 text-[10px] text-brand-500 text-right">Recalculating…</p>
        )}
      </div>

      {/* P&L block */}
      <div className="rounded-lg border bg-white p-4 text-xs shadow-sm">
        <PnlRow label="Revenue:" cents={rev} bold />
        <PnlRow label="Discounts:" cents={totalDiscountCents} bps={pct(totalDiscountCents)} negative />
        <Divider />
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Costs
        </p>
        <PnlRow label="Labor / Line Items:" cents={costByType.labor}          bps={pct(costByType.labor)} />
        <PnlRow label="Sub Contract:"     cents={costByType.sub_contract}     bps={pct(costByType.sub_contract)} />
        <PnlRow label="Service:"          cents={costByType.service}          bps={pct(costByType.service)} />
        <PnlRow label="Product/Materials:"cents={costByType.product_material} bps={pct(costByType.product_material)} />
        <PnlRow label="Asset/Equipment:"  cents={costByType.asset_equipment}  bps={pct(costByType.asset_equipment)} />
        <PnlRow label="Other:"            cents={costByType.other}            bps={pct(costByType.other)} />
        <Divider />
        <PnlRow label="Est Gross Profit:" cents={estimate.grossProfitCents}   bps={grossBps} bold />
        <PnlRow label="Overhead Cost:"    cents={estimate.overheadCostCents}  bps={pct(estimate.overheadCostCents)} />
        <PnlRow label="Est Net Profit:"   cents={estimate.netProfitCents}     bps={netBps} bold />
      </div>

      {/* Totals block */}
      <div className="rounded-lg border bg-white p-4 text-xs shadow-sm">
        <PnlRow label="Subtotal:" cents={estimate.subtotalCents} bold />
        <PnlRow label="Est Sales Tax:" cents={estimate.taxCents} />
        <Divider />
        <PnlRow label="Total:" cents={estimate.totalCents} bold />
      </div>

      {/* Aspire-style summary block */}
      <div className="rounded-lg border bg-white p-4 text-xs shadow-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Estimate Summary
        </p>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Net Price:</span>
          <span className="tabular-nums font-semibold">${(rev / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Overhead:</span>
          <span className="tabular-nums">${(estimate.overheadCostCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Break Even:</span>
          <span className="tabular-nums">${((totalCostCents + estimate.overheadCostCents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <Divider />
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Net Profit:</span>
          <span className={`tabular-nums font-semibold ${netBps >= 0 ? "text-green-600" : "text-red-500"}`}>
            {bpsToPercent(netBps)}
          </span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Gross Margin:</span>
          <span className={`tabular-nums font-semibold ${grossBps >= 0 ? "text-green-600" : "text-red-500"}`}>
            {bpsToPercent(grossBps)}
          </span>
        </div>
        <Divider />
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Total B. Hrs:</span>
          <span className="tabular-nums">{estimate.totalBudgetedHours.toFixed(2)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Revenue / Man Hr:</span>
          <span className="tabular-nums">${revenueManHr.toFixed(2)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Net Profit / Man Hr:</span>
          <span className={`tabular-nums font-semibold ${netManHr >= 0 ? "text-green-600" : "text-red-500"}`}>
            ${netManHr.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
