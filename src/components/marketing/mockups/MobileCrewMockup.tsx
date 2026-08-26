import { MapPin, Camera, Clock } from "lucide-react";

const STOPS = [
  { client: "Riverside HOA", address: "412 Riverside Dr", service: "Weekly Mow & Trim", status: "Completed", cls: "bg-green-100 text-green-700" },
  { client: "Fell Custom Homes", address: "88 Meadowbrook Ln", service: "Bed Edging", status: "En Route", cls: "bg-orange-100 text-orange-700" },
  { client: "Cobblestone Plaza", address: "1600 Commerce Ave", service: "Irrigation Check", status: "Scheduled", cls: "bg-slate-100 text-slate-500" },
];

export function MobileCrewMockup() {
  return (
    <div className="flex h-[420px] items-center justify-center bg-slate-100 py-6">
      <div className="flex h-full w-[230px] flex-col overflow-hidden rounded-[26px] border-[6px] border-[#0a0a0a] bg-white shadow-xl">
        <div className="flex items-center justify-between bg-[#005642] px-3 py-2.5 text-white">
          <span className="text-[11px] font-bold">Today's Stops</span>
          <Clock className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-2.5">
          {STOPS.map((s) => (
            <div key={s.client} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="mb-1 flex items-start justify-between gap-1.5">
                <span className="text-[10.5px] font-semibold text-[#0a0a0a]">{s.client}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${s.cls}`}>
                  {s.status}
                </span>
              </div>
              <div className="mb-1 flex items-center gap-1 text-[9px] text-slate-500">
                <MapPin className="h-2.5 w-2.5" />
                {s.address}
              </div>
              <div className="text-[9.5px] text-slate-600">{s.service}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-1.5 border-t border-slate-200 bg-white py-2">
          <Camera className="h-3.5 w-3.5 text-brand-500" />
          <span className="text-[9.5px] font-medium text-brand-600">Add job photo</span>
        </div>
      </div>
    </div>
  );
}
