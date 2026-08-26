const BARS = [62, 84, 45, 90, 70, 55, 95];
const LINE_POINTS = "0,32 15,26 30,29 45,18 60,20 75,10 90,14 105,4";

export function DashboardBuilderMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Company Scorecard — Q3</div>
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
          Custom dashboard
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2.5">
        <div className="col-span-3 rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
            Revenue by Week
          </div>
          <div className="flex h-16 items-end gap-1.5">
            {BARS.map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-[#60ab45]" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        <div className="col-span-3 rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
            Margin Trend
          </div>
          <svg viewBox="0 0 105 36" className="h-16 w-full" preserveAspectRatio="none">
            <polyline points={LINE_POINTS} fill="none" stroke="#2aa9e0" strokeWidth="2" />
          </svg>
        </div>

        <div className="col-span-2 rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">New Clients</div>
          <div className="mt-1 text-[19px] font-bold text-[#0a0a0a]">212</div>
          <div className="text-[9px] text-green-600">+18 this month</div>
        </div>
        <div className="col-span-2 rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">AR Days</div>
          <div className="mt-1 text-[19px] font-bold text-[#0a0a0a]">27</div>
          <div className="text-[9px] text-green-600">Target 30</div>
        </div>
        <div className="col-span-2 rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Close Ratio</div>
          <div className="mt-1 text-[19px] font-bold text-[#0a0a0a]">38%</div>
          <div className="text-[9px] text-amber-600">Target 45%</div>
        </div>
      </div>
    </div>
  );
}
