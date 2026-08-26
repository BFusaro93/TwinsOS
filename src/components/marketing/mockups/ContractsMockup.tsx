const CONTRACTS = [
  { client: "Lakeside HOA", plan: "Gold Maintenance", amt: "$1,240.00/mo", status: "Active", cls: "border-green-200 bg-green-100 text-green-800" },
  { client: "Whitmore Apartments", plan: "7-Step Fert Program", amt: "$380.00/mo", status: "Active", cls: "border-green-200 bg-green-100 text-green-800" },
  { client: "Greenway Business Park", plan: "Snow — Seasonal", amt: "$2,600.00/season", status: "Active", cls: "border-green-200 bg-green-100 text-green-800" },
  { client: "Cobblestone Plaza", plan: "Basic Maintenance", amt: "$540.00/mo", status: "Renews Oct 1", cls: "border-yellow-200 bg-yellow-100 text-yellow-700" },
];

const PACKAGE_VISITS = [
  { label: "Fertilization", used: 3, total: 7 },
  { label: "Mowing", used: 18, total: 26 },
  { label: "Aeration", used: 0, total: 1 },
];

export function ContractsMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 text-[13px] font-bold text-[#0a0a0a]">Contracts &amp; Packages</div>

      <table className="mb-4 w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-left">Plan</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {CONTRACTS.map((c) => (
            <tr key={c.client} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{c.client}</td>
              <td className="px-3 py-2 text-slate-500">{c.plan}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{c.amt}</td>
              <td className="px-3 py-2 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${c.cls}`}>{c.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">
          Whitmore Apartments — 7-Step Fert Program (visits used)
        </div>
        <div className="flex flex-col gap-2">
          {PACKAGE_VISITS.map((v) => (
            <div key={v.label}>
              <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-600">
                <span>{v.label}</span>
                <span className="font-medium">{v.used} / {v.total}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#60ab45]"
                  style={{ width: `${(v.used / v.total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
