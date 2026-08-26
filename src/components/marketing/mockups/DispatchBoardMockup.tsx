import { Calendar, Smartphone, CalendarCheck, CheckCircle2 } from "lucide-react";

type Row = {
  status: "scheduled" | "dispatched" | "in_progress" | "completed";
  client: string;
  service: string;
  city: string;
  crew: string;
  start: string;
  end: string;
  amt: string;
  varianceUp?: boolean;
};

const STATUS_ICON = {
  scheduled: { Icon: Calendar, cls: "text-slate-400" },
  dispatched: { Icon: Smartphone, cls: "text-orange-400" },
  in_progress: { Icon: CalendarCheck, cls: "text-yellow-500" },
  completed: { Icon: CheckCircle2, cls: "text-green-500" },
} as const;

const ROWS: Row[] = [
  { status: "completed", client: "Riverside HOA", service: "Weekly Mow & Trim", city: "Maple Grove", crew: "Crew 2 — J. Alvarez", start: "7:00a", end: "8:15a", amt: "$340.00" },
  { status: "completed", client: "Fell Custom Homes", service: "Bed Edging", city: "Maple Grove", crew: "Crew 2 — J. Alvarez", start: "8:20a", end: "9:00a", amt: "$180.00" },
  { status: "in_progress", client: "Cobblestone Plaza", service: "Irrigation Check", city: "Kessler Park", crew: "Crew 4 — T. Nguyen", start: "9:00a", end: "10:30a", amt: "$225.00", varianceUp: true },
  { status: "dispatched", client: "Whitmore Apartments", service: "Fert — Round 3 of 7", city: "Kessler Park", crew: "Crew 1 — D. Reyes", start: "10:00a", end: "11:15a", amt: "$410.00" },
  { status: "dispatched", client: "Lakeside Medical Center", service: "Mulch Install", city: "Elm Ridge", crew: "Crew 3 — B. Ortiz", start: "11:00a", end: "1:00p", amt: "$960.00" },
  { status: "scheduled", client: "Greenway Business Park", service: "Snow — 2\" Trigger", city: "Elm Ridge", crew: "Crew 1 — D. Reyes", start: "—", end: "—", amt: "$1,200.00" },
];

export function DispatchBoardMockup() {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-[#eceae3] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-[#0a0a0a]">Dispatch Board</span>
          <span className="text-[11px] text-slate-400">Mon, Aug 24</span>
        </div>
        <div className="flex gap-2">
          <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-medium text-slate-600">Team Assign</span>
          <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-medium text-slate-600">Optimize Route</span>
        </div>
      </div>

      <div className="flex gap-4 border-b border-[#eceae3] bg-slate-50 px-4 py-1.5 text-[11px]">
        <span className="font-semibold text-slate-500">6 Jobs Total</span>
        <span className="text-orange-500">2 Dispatched</span>
        <span className="text-yellow-600">1 In Progress</span>
        <span className="text-green-600">2 Completed</span>
      </div>

      <table className="w-full min-w-[720px] text-[11px]">
        <thead className="sticky top-0 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="w-8 px-3 py-2 text-left">St</th>
            <th className="px-1 py-2 text-left">Client</th>
            <th className="px-1 py-2 text-left">Service</th>
            <th className="px-1 py-2 text-left">Crew</th>
            <th className="px-1 py-2 text-left">Start</th>
            <th className="px-1 py-2 text-left">End</th>
            <th className="px-3 py-2 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const { Icon, cls } = STATUS_ICON[r.status];
            return (
              <tr key={r.client} className="border-t border-[#f0efe9] hover:bg-slate-50">
                <td className="px-3 py-2"><Icon className={`h-3.5 w-3.5 ${cls}`} /></td>
                <td className="px-1 py-2 font-medium text-[#0a0a0a]">{r.client}</td>
                <td className="px-1 py-2 text-slate-500">{r.service}</td>
                <td className="px-1 py-2 text-slate-500">{r.crew}</td>
                <td className="px-1 py-2 text-slate-500">{r.start}</td>
                <td className="px-1 py-2 text-slate-500">{r.end}</td>
                <td className="px-3 py-2 text-right font-medium text-[#0a0a0a]">{r.amt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
