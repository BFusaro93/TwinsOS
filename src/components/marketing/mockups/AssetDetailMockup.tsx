import { Gauge, Wrench, Boxes } from "lucide-react";

export function AssetDetailMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-bold text-[#0a0a0a]">2019 Exmark Lazer Z — Unit 14</div>
          <div className="text-[10.5px] text-slate-400">Asset #AST-0114 · Mowing Equipment</div>
        </div>
        <span className="rounded border border-green-200 bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-800">
          Active
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            <Gauge className="h-3 w-3" /> Meter
          </div>
          <div className="text-[15px] font-bold text-[#0a0a0a]">1,842 hrs</div>
          <div className="text-[9px] text-slate-400">Updated 2 days ago</div>
        </div>
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-yellow-700">
            <Wrench className="h-3 w-3" /> Next PM
          </div>
          <div className="text-[15px] font-bold text-yellow-800">158 hrs away</div>
          <div className="text-[9px] text-yellow-600">Blade & fluid service</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            <Boxes className="h-3 w-3" /> Linked Parts
          </div>
          <div className="text-[15px] font-bold text-[#0a0a0a]">6 parts</div>
          <div className="text-[9px] text-slate-400">1 low stock</div>
        </div>
      </div>

      <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">
        Service History
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Work Order</th>
            <th className="px-3 py-2 text-right">Meter</th>
            <th className="px-3 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {[
            { date: "Aug 12", wo: "WO-00138 — Belt replacement", meter: "1,790 hrs", cost: "$142.00" },
            { date: "Jun 30", wo: "WO-00119 — Blade & fluid service", meter: "1,610 hrs", cost: "$96.50" },
            { date: "Apr 08", wo: "WO-00097 — Hydraulic hose repair", meter: "1,455 hrs", cost: "$210.00" },
          ].map((r) => (
            <tr key={r.wo} className="border-b border-slate-100">
              <td className="px-3 py-2 text-slate-500">{r.date}</td>
              <td className="px-3 py-2 font-medium text-slate-700">{r.wo}</td>
              <td className="px-3 py-2 text-right text-slate-500">{r.meter}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{r.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
