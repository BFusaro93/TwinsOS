type Card = { num: string; client: string; desc: string; total: string; prob: number };

const COLUMNS: {
  key: string;
  label: string;
  col: string;
  dot: string;
  cards: Card[];
}[] = [
  {
    key: "draft",
    label: "Draft",
    col: "border-slate-200 bg-slate-50",
    dot: "bg-slate-400",
    cards: [{ num: "#00114", client: "Whitmore Apartments", desc: "Spring Cleanup", total: "$2,140.00", prob: 20 }],
  },
  {
    key: "quote",
    label: "Quote",
    col: "border-blue-200 bg-blue-50",
    dot: "bg-blue-500",
    cards: [
      { num: "#00109", client: "Cobblestone Plaza", desc: "Irrigation Retrofit", total: "$8,600.00", prob: 40 },
      { num: "#00111", client: "Elm Ridge Family Dental", desc: "Bed Renovation", total: "$3,275.00", prob: 40 },
    ],
  },
  {
    key: "sent",
    label: "Sent",
    col: "border-yellow-200 bg-yellow-50",
    dot: "bg-yellow-500",
    cards: [{ num: "#00107", client: "Lakeside HOA", desc: "7-Step Fert Program", total: "$14,900.00", prob: 65 }],
  },
  {
    key: "accepted",
    label: "Accepted",
    col: "border-green-200 bg-green-50",
    dot: "bg-green-500",
    cards: [
      { num: "#00102", client: "Greenway Business Park", desc: "Mulch & Bed Edging", total: "$5,420.00", prob: 100 },
      { num: "#00098", client: "Fell Custom Homes", desc: "Full Landscape Install", total: "$41,300.00", prob: 100 },
    ],
  },
];

export function EstimatesPipelineMockup() {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-[#eceae3] px-4 py-2.5">
        <span className="text-[13px] font-bold text-[#0a0a0a]">Estimates — Pipeline</span>
        <span className="text-[11px] text-slate-400">$70,635 weighted</span>
      </div>
      <div className="flex gap-3 overflow-x-auto p-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className={`w-[210px] shrink-0 rounded-md border p-2 ${col.col}`}>
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{col.label}</span>
              <span className="ml-auto text-[10px] text-slate-400">{col.cards.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.cards.map((c) => (
                <div key={c.num} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] font-medium text-slate-400">{c.num}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8.5px] font-medium text-slate-500">{c.prob}%</span>
                  </div>
                  <div className="text-[11px] font-semibold text-[#0a0a0a]">{c.client}</div>
                  <div className="text-[10px] text-slate-500">{c.desc}</div>
                  <div className="mt-1.5 text-[12px] font-bold text-[#60ab45]">{c.total}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
