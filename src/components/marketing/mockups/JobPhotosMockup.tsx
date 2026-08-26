const PHOTOS = [
  { tag: "Before", color: "#e8e6df", client: "Fell Custom Homes", label: "Bed Renovation" },
  { tag: "After", color: "#dcecd0", client: "Fell Custom Homes", label: "Bed Renovation" },
  { tag: "During", color: "#e0e8ee", client: "Cobblestone Plaza", label: "Irrigation Retrofit" },
  { tag: "Before", color: "#e8e6df", client: "Greenway Business Park", label: "Mulch & Edging" },
  { tag: "After", color: "#dcecd0", client: "Greenway Business Park", label: "Mulch & Edging" },
  { tag: "Annotated", color: "#f3e6d8", client: "Lakeside Medical Center", label: "Drainage Issue" },
];

const TAG_COLOR: Record<string, string> = {
  Before: "bg-slate-100 text-slate-600",
  During: "bg-blue-100 text-blue-700",
  After: "bg-green-100 text-green-700",
  Annotated: "bg-amber-100 text-amber-700",
};

export function JobPhotosMockup() {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-[#eceae3] px-4 py-2.5">
        <span className="text-[13px] font-bold text-[#0a0a0a]">Job Photos</span>
        <span className="text-[11px] text-slate-400">6 photos</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5 p-3">
        {PHOTOS.map((p, i) => (
          <div key={i} className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <div
              className="flex h-[72px] items-center justify-center"
              style={{
                background: `repeating-linear-gradient(135deg, ${p.color} 0px, ${p.color} 8px, #ffffff 8px, #ffffff 16px)`,
              }}
            >
              <span className={`rounded px-1.5 py-0.5 text-[8.5px] font-semibold ${TAG_COLOR[p.tag]}`}>{p.tag}</span>
            </div>
            <div className="px-2 py-1.5">
              <div className="truncate text-[9.5px] font-medium text-[#0a0a0a]">{p.client}</div>
              <div className="truncate text-[8.5px] text-slate-400">{p.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
