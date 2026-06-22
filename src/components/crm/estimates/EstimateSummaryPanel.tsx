"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { bpsToPercent } from "@/lib/estimate-calc";
import type { Estimate } from "@/types/crm-estimates";

interface RecalcParams {
  taxRateBps: number;
  overheadRateBps: number;
  discountCents: number;
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
  const lineItems   = estimate.lineItems ?? [];
  const directCosts = estimate.directCosts ?? [];

  // Editable financial settings — initialized from estimate
  const [taxRateStr,      setTaxRateStr]      = useState(String((estimate.taxRateBps / 100).toFixed(2)));
  const [overheadRateStr, setOverheadRateStr] = useState(String((estimate.overheadRateBps / 100).toFixed(2)));
  const [discountStr,     setDiscountStr]     = useState(String((estimate.discountCents / 100).toFixed(2)));

  async function handleRecalc() {
    const taxRateBps      = Math.round((parseFloat(taxRateStr) || 0) * 100);
    const overheadRateBps = Math.round((parseFloat(overheadRateStr) || 0) * 100);
    const discountCents   = Math.round((parseFloat(discountStr) || 0) * 100);
    await onRecalculate({ taxRateBps, overheadRateBps, discountCents });
  }

  // Cost breakdown by type (from direct costs)
  const costByType: Record<string, number> = {
    labor: 0, sub_contract: 0, service: 0,
    product_material: 0, asset_equipment: 0, other: 0,
  };
  directCosts.forEach((dc) => {
    costByType[dc.costType] = (costByType[dc.costType] ?? 0) + dc.totalCents;
  });

  const totalDirectCents  = directCosts.reduce((s, dc) => s + dc.totalCents, 0);
  const totalCostCents    = lineItems.reduce((s, li) => s + li.totalCostCents, 0) + totalDirectCents;
  const rev               = estimate.revenueCents;

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
          onBlur={handleRecalc}
        />
        <RateRow
          label="Overhead Rate"
          value={overheadRateStr}
          onChange={setOverheadRateStr}
          onBlur={handleRecalc}
        />
        <RateRow
          label="Discount"
          value={discountStr}
          onChange={setDiscountStr}
          onBlur={handleRecalc}
          suffix="$"
        />
        {recalcPending && (
          <p className="mt-1 text-[10px] text-brand-500 text-right">Recalculating…</p>
        )}
      </div>

      {/* P&L block */}
      <div className="rounded-lg border bg-white p-4 text-xs shadow-sm">
        <PnlRow label="Revenue:" cents={rev} bold />
        <PnlRow label="Discounts:" cents={estimate.discountCents} bps={pct(estimate.discountCents)} negative />
        <Divider />
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Costs
        </p>
        <PnlRow label="Labor:"            cents={costByType.labor}            bps={pct(costByType.labor)} />
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
