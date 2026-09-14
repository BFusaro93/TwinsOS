const PROJECTS = [
  { name: "Fell Custom Homes — Full Landscape Install", budget: "$41,300.00", actual: "$38,950.00", status: "On Budget", cls: "border-green-200 bg-green-100 text-green-800" },
  { name: "Cobblestone Plaza — Irrigation Retrofit", budget: "$8,600.00", actual: "$9,140.00", status: "Over Budget", cls: "border-red-200 bg-red-100 text-red-700" },
  { name: "Greenway Business Park — Mulch & Bed Edging", budget: "$5,420.00", actual: "$4,980.00", status: "In Progress", cls: "border-blue-200 bg-blue-50 text-blue-700" },
];

export function ProjectsMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Projects</div>
        <span className="text-[10.5px] text-slate-400">3 active</span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Project</th>
            <th className="px-3 py-2 text-right">Budget</th>
            <th className="px-3 py-2 text-right">Actual</th>
            <th className="px-3 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {PROJECTS.map((p) => (
            <tr key={p.name} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{p.name}</td>
              <td className="px-3 py-2 text-right text-slate-500">{p.budget}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{p.actual}</td>
              <td className="px-3 py-2 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${p.cls}`}>{p.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
