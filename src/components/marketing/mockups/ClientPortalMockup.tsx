import { FileCheck2, Receipt } from "lucide-react";

const INVOICES = [
  { num: "#00512", desc: "Weekly Mow & Trim — August", amt: "$340.00", status: "Due Sep 5", cls: "border-yellow-200 bg-yellow-100 text-yellow-700" },
  { num: "#00498", desc: "Mulch Install", amt: "$960.00", status: "Paid", cls: "border-green-200 bg-green-100 text-green-800" },
];

export function ClientPortalMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Hi, Riverside HOA</div>
        <div className="flex gap-3 text-[10.5px] font-medium text-slate-400">
          <span className="text-[#005642]">Invoices</span>
          <span>Estimates</span>
          <span>Tickets</span>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {INVOICES.map((inv) => (
          <div key={inv.num} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100">
                <Receipt className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#0a0a0a]">{inv.desc}</div>
                <div className="text-[9.5px] text-slate-400">{inv.num}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${inv.cls}`}>{inv.status}</span>
              <span className="text-[11.5px] font-bold text-[#0a0a0a]">{inv.amt}</span>
              {inv.status !== "Paid" && (
                <span className="rounded bg-[#60ab45] px-2 py-1 text-[9.5px] font-semibold text-white">Pay Now</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-semibold text-[#0a0a0a]">Estimate #00109 — Irrigation Retrofit</span>
        </div>
        <div className="mb-2 text-[10.5px] text-slate-500">Cobblestone Plaza · $8,600.00 · Valid through Sep 15</div>
        <div className="flex gap-2">
          <span className="rounded bg-[#60ab45] px-2.5 py-1 text-[9.5px] font-semibold text-white">Accept</span>
          <span className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[9.5px] font-semibold text-slate-600">
            Request Changes
          </span>
        </div>
      </div>
    </div>
  );
}
