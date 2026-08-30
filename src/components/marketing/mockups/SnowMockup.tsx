import { Snowflake } from "lucide-react";

const SNOW_JOBS = [
  { client: "Greenway Business Park", route: "Route 2", crew: "Crew B", status: "In Progress", cls: "border-blue-200 bg-blue-100 text-blue-800" },
  { client: "Whitmore Apartments", route: "Route 2", crew: "Crew B", status: "Queued", cls: "border-slate-200 bg-slate-100 text-slate-600" },
  { client: "Cobblestone Plaza", route: "Route 1", crew: "Crew A", status: "Complete", cls: "border-green-200 bg-green-100 text-green-800" },
  { client: "Lakeside HOA", route: "Route 1", crew: "Crew A", status: "Complete", cls: "border-green-200 bg-green-100 text-green-800" },
];

export function SnowMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-800">
          <Snowflake className="h-3.5 w-3.5" />
          Storm trigger hit: 2.5&quot; accumulation
        </div>
        <span className="text-[10px] font-medium text-blue-600">Auto-dispatched 6:15 AM</span>
      </div>

      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-left">Route</th>
            <th className="px-3 py-2 text-left">Crew</th>
            <th className="px-3 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {SNOW_JOBS.map((j, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{j.client}</td>
              <td className="px-3 py-2 text-slate-500">{j.route}</td>
              <td className="px-3 py-2 text-slate-500">{j.crew}</td>
              <td className="px-3 py-2 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${j.cls}`}>{j.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
