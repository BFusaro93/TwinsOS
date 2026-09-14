"use client";

import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Users, ArrowLeft } from "lucide-react";
import type { ReferralReportRow } from "@/app/api/crm/reports/referrals/route";

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  inactive:  "bg-slate-100 text-slate-500",
  lead:      "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
};

function SummaryKPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ReferralsReportPage() {
  const { data, isLoading } = useQuery<{ rows: ReferralReportRow[] }>({
    queryKey: ["crm-referrals-report"],
    queryFn: async () => {
      const res = await fetch("/api/crm/reports/referrals");
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<{ rows: ReferralReportRow[] }>;
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const summary = useMemo(() => {
    const totalReferred = rows.reduce((s, r) => s + r.referredClients.length, 0);
    const activeReferred = rows.reduce(
      (s, r) => s + r.referredClients.filter((c) => c.status === "active").length,
      0
    );
    return { totalReferrers: rows.length, totalReferred, activeReferred };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1000px] mx-auto">
      <div>
        <Link href="/crm/admin/reports" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <ArrowLeft className="h-3 w-3" /> Back to Reports
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Client Referrals</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Clients whose &quot;Referred By&quot; is linked to another client record
        </p>
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <SummaryKPI label="Referring Clients" value={summary.totalReferrers.toLocaleString()} />
          <SummaryKPI label="Total Referred" value={summary.totalReferred.toLocaleString()} />
          <SummaryKPI
            label="Still Active"
            value={summary.totalReferred > 0 ? `${Math.round((summary.activeReferred / summary.totalReferred) * 100)}%` : "—"}
            sub={`${summary.activeReferred} of ${summary.totalReferred}`}
          />
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Users className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">No linked referrals yet.</p>
            <p className="text-xs text-slate-300">
              Pick an existing client in a client&apos;s Referred By field to have it show up here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Client Since</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.referrerId}>
                    <tr className="border-b bg-slate-50/60">
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-slate-800">
                        <Link href={`/crm/clients/${r.referrerId}`} className="hover:text-brand-600 hover:underline">
                          {r.referrerName}
                        </Link>
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          referred {r.referredClients.length} client{r.referredClients.length !== 1 ? "s" : ""}
                        </span>
                      </td>
                    </tr>
                    {r.referredClients.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5 pl-8">
                          <Link href={`/crm/clients/${c.id}`} className="text-slate-700 hover:text-brand-600 hover:underline">
                            {c.displayName}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLOR[c.status] ?? "bg-slate-100 text-slate-500")}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {formatDate(c.clientSince)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {c.balanceOutstandingCents > 0
                            ? <span className="font-semibold text-red-600">{formatCurrency(c.balanceOutstandingCents)}</span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
