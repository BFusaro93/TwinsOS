const ROWS = [
  { asset: "2019 Exmark Lazer Z — Unit 14", task: "Blade & fluid service", freq: "Every 150 hrs", due: "158 hrs away", cls: "border-green-200 bg-green-100 text-green-800", status: "Upcoming" },
  { asset: "F-250 Service Truck — Unit 3", task: "Oil change", freq: "Every 5,000 mi", due: "Due in 4 days", cls: "border-yellow-200 bg-yellow-100 text-yellow-700", status: "Due Soon" },
  { asset: "Toro Z Master — Unit 9", task: "Air filter replacement", freq: "Every 200 hrs", due: "12 hrs overdue", cls: "border-red-200 bg-red-100 text-red-700", status: "Overdue" },
  { asset: "Trailer — Unit 21", task: "Brake inspection", freq: "Quarterly", due: "Due Oct 1", cls: "border-slate-200 bg-slate-100 text-slate-500", status: "Scheduled" },
];

export function PMScheduleMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">PM Schedules</div>
        <span className="text-[10.5px] text-slate-400">1 overdue · 1 due soon</span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Asset</th>
            <th className="px-3 py-2 text-left">Task</th>
            <th className="px-3 py-2 text-left">Frequency</th>
            <th className="px-3 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.asset} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{r.asset}</td>
              <td className="px-3 py-2 text-slate-500">{r.task}</td>
              <td className="px-3 py-2 text-slate-500">{r.freq}</td>
              <td className="px-3 py-2 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${r.cls}`}>{r.due}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
