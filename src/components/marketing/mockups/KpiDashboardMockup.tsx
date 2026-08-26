function scoreColor(score: number) {
  if (score >= 90) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 30) return "bg-amber-400";
  return "bg-slate-300";
}

const CATEGORIES = [
  {
    name: "Financial",
    score: 91,
    metrics: [
      { label: "Revenue (Invoiced)", value: "$2.94M / $3.2M", pct: 92 },
      { label: "Gross Margin YTD", value: "48.6% / 50%", pct: 97 },
      { label: "AR Days", value: "27 / 30", pct: 90 },
    ],
  },
  {
    name: "Operations",
    score: 76,
    metrics: [
      { label: "Labor Efficiency YTD", value: "94 / 100", pct: 94 },
      { label: "OT % of Total Hours", value: "8.4% / 10%", pct: 84 },
      { label: "Fleet Safety Score", value: "81 / 90", pct: 68 },
    ],
  },
  {
    name: "Sales",
    score: 64,
    metrics: [
      { label: "New Clients YTD", value: "212 / 300", pct: 71 },
      { label: "Close Ratio", value: "38% / 45%", pct: 60 },
    ],
  },
];

export function KpiDashboardMockup() {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-[#eceae3] px-4 py-2.5">
        <span className="text-[13px] font-bold text-[#0a0a0a]">Company Scorecard</span>
        <span className="flex items-center gap-1.5 rounded-full bg-blue-500 px-2.5 py-1 text-[10.5px] font-bold text-white shadow-sm">
          Overall <span className="rounded-full bg-white/20 px-1.5">80%</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-3">
        {CATEGORIES.map((cat) => (
          <div key={cat.name} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-2.5 py-2">
              <span className="text-[10.5px] font-semibold text-slate-700">{cat.name}</span>
              <span className={`flex h-5 w-9 items-center justify-center rounded-full text-[9.5px] font-bold text-white shadow-sm ${scoreColor(cat.score)}`}>
                {cat.score}%
              </span>
            </div>
            <div>
              {cat.metrics.map((m, i) => (
                <div key={m.label} className={`px-2.5 py-1.5 ${i % 2 === 0 ? "bg-slate-50/50" : "bg-white"}`}>
                  <div className="flex items-center justify-between text-[9px] text-slate-500">
                    <span>{m.label}</span>
                    <span className="font-medium text-slate-600">{m.value}</span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${scoreColor(m.pct)}`} style={{ width: `${m.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
