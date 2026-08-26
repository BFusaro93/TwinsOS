type Row = {
  label: string;
  est: string;
  actual: string;
  variance: string;
  favorable: boolean;
};

const ROWS: Row[] = [
  { label: "Labor Hours", est: "14.0 hrs", actual: "12.5 hrs", variance: "-1.5 hrs (-10.7%)", favorable: true },
  { label: "Labor Cost", est: "$490.00", actual: "$437.50", variance: "-$52.50 (-10.7%)", favorable: true },
  { label: "Materials", est: "$1,080.00", actual: "$1,142.00", variance: "+$62.00 (+5.7%)", favorable: false },
  { label: "Revenue", est: "$5,420.00", actual: "$5,420.00", variance: "$0.00 (0.0%)", favorable: true },
];

const SUMMARY = [
  { label: "Estimated Revenue", value: "$5,420.00" },
  { label: "Actual Cost", value: "$1,579.50", sub: "Labor $437.50 + Materials $1,142.00" },
  { label: "Gross Profit", value: "$3,840.50", highlight: "green" as const },
  { label: "Margin %", value: "70.9%", highlight: "green" as const },
];

export function JobCostingMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 text-[13px] font-bold text-[#0a0a0a]">
        Fell Custom Homes — Full Landscape Install
        <span className="ml-2 font-normal text-slate-400">Job Costing</span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2.5">
        {SUMMARY.map((s) => (
          <div key={s.label} className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className={`mt-0.5 text-[13px] font-bold ${s.highlight === "green" ? "text-green-600" : "text-[#0a0a0a]"}`}>
              {s.value}
            </div>
            {s.sub && <div className="mt-0.5 text-[8px] text-slate-400">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">
        Estimated vs. Actual
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Line</th>
            <th className="px-3 py-2 text-right">Estimated</th>
            <th className="px-3 py-2 text-right">Actual</th>
            <th className="px-3 py-2 text-right">Variance</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{r.label}</td>
              <td className="px-3 py-2 text-right text-slate-500">{r.est}</td>
              <td className="px-3 py-2 text-right text-slate-700">{r.actual}</td>
              <td className={`px-3 py-2 text-right font-medium ${r.favorable ? "text-green-600" : "text-red-600"}`}>
                {r.variance}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
