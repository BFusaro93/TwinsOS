"use client";

import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { BILLABLE_PLANS } from "@/lib/stripe/plans";
import { PLAN_FEATURE_CATEGORIES } from "@/lib/stripe/plan-features";

/**
 * Presentational only — no data fetching, no billing hooks — so this can be
 * dropped into a future public marketing pricing page (see home.works/pricing
 * for the pattern this follows: categorized feature rows, checkmarks/limits
 * per plan column) without pulling in any authenticated app dependencies.
 */
export function PlanComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Feature
            </th>
            {BILLABLE_PLANS.map((p) => (
              <th key={p.plan} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_FEATURE_CATEGORIES.map((category) => (
            <Fragment key={category.category}>
              <tr className="border-b bg-slate-50/60">
                <td colSpan={BILLABLE_PLANS.length + 1} className="px-4 py-2 text-xs font-semibold text-slate-600">
                  {category.category}
                </td>
              </tr>
              {category.features.map((feature) => (
                <tr key={feature.key} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{feature.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{feature.description}</p>
                  </td>
                  {BILLABLE_PLANS.map((p) => {
                    const value = feature.values[p.plan];
                    return (
                      <td key={p.plan} className="px-4 py-3 text-center">
                        {value === true ? (
                          <Check className="mx-auto h-4 w-4 text-brand-600" />
                        ) : value === false ? (
                          <Minus className="mx-auto h-4 w-4 text-slate-300" />
                        ) : (
                          <span className="text-xs text-slate-600">{value}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
