const ROWS = [
  { part: "Mower Blade — 21in", num: "PRT-0041", qty: 14, reorder: 10, assets: 6, status: "In Stock", cls: "border-green-200 bg-green-100 text-green-800" },
  { part: "Hydraulic Filter", num: "PRT-0088", qty: 3, reorder: 8, assets: 4, status: "Low Stock", cls: "border-red-200 bg-red-100 text-red-700" },
  { part: "5W-30 Engine Oil (qt)", num: "PRT-0012", qty: 22, reorder: 12, assets: 11, status: "In Stock", cls: "border-green-200 bg-green-100 text-green-800" },
  { part: "Trailer Brake Pad Set", num: "PRT-0155", qty: 2, reorder: 4, assets: 3, status: "Low Stock", cls: "border-red-200 bg-red-100 text-red-700" },
];

export function PartsInventoryMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Parts Inventory</div>
        <span className="text-[10.5px] text-red-600">2 low stock</span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Part</th>
            <th className="px-3 py-2 text-right">Qty on Hand</th>
            <th className="px-3 py-2 text-right">Reorder Pt.</th>
            <th className="px-3 py-2 text-right">Linked Assets</th>
            <th className="px-3 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.num} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-700">{r.part}</div>
                <div className="text-[9.5px] text-slate-400">{r.num}</div>
              </td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{r.qty}</td>
              <td className="px-3 py-2 text-right text-slate-500">{r.reorder}</td>
              <td className="px-3 py-2 text-right text-slate-500">{r.assets}</td>
              <td className="px-3 py-2 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${r.cls}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
