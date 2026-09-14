const ROWS = [
  { num: "REQ-0412", desc: "Mower blades & filters — spring stock-up", requester: "D. Reyes", status: "Pending Approval", cls: "border-yellow-200 bg-yellow-100 text-yellow-700", amt: "$1,240.00" },
  { num: "REQ-0410", desc: "Hydraulic hoses — Unit 14", requester: "B. Ortiz", status: "Approved", cls: "border-green-200 bg-green-100 text-green-800", amt: "$310.00" },
  { num: "PO-0287", desc: "Fert program materials — Q3", requester: "T. Nguyen", status: "Ordered", cls: "border-blue-200 bg-blue-50 text-blue-700", amt: "$4,850.00" },
  { num: "PO-0284", desc: "Salt & de-icer — winter stock", requester: "D. Reyes", status: "Received", cls: "border-slate-200 bg-slate-100 text-slate-600", amt: "$2,100.00" },
];

const CHAIN = [
  { step: "Requestor", done: true },
  { step: "Manager", done: true },
  { step: "Admin", done: false },
];

export function PurchasingMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Requisitions &amp; Purchase Orders</div>
        <span className="text-[10.5px] text-slate-400">2 pending your approval</span>
      </div>

      <table className="mb-4 w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-left">Requested By</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.num} className="border-b border-slate-100">
              <td className="px-3 py-2 text-slate-400">{r.num}</td>
              <td className="px-3 py-2 font-medium text-slate-700">{r.desc}</td>
              <td className="px-3 py-2 text-slate-500">{r.requester}</td>
              <td className="px-3 py-2">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${r.cls}`}>{r.status}</span>
              </td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{r.amt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">
          REQ-0412 — Approval Chain
        </div>
        <div className="flex items-center gap-2">
          {CHAIN.map((c, i) => (
            <div key={c.step} className="flex items-center gap-2">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${
                  c.done ? "bg-[#60ab45] text-white" : "border border-slate-300 bg-white text-slate-400"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-[10px] font-medium ${c.done ? "text-slate-700" : "text-slate-400"}`}>
                {c.step}
              </span>
              {i < CHAIN.length - 1 && <div className={`h-px w-6 ${c.done ? "bg-[#60ab45]" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
