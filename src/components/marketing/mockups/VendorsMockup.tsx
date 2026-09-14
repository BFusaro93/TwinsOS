const VENDORS = [
  { name: "Greenline Supply Co.", type: "Parts & Materials", used: "PO + Maintenance", spend: "$18,400 YTD" },
  { name: "Turf Solutions Inc.", type: "Fert & Chemical", used: "Purchase Orders", spend: "$9,120 YTD" },
  { name: "Reliable Fleet Service", type: "Vehicle Repair", used: "Maintenance", spend: "$6,850 YTD" },
  { name: "Statewide Irrigation", type: "Irrigation Parts", used: "PO + Maintenance", spend: "$3,275 YTD" },
];

export function VendorsMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Vendors</div>
        <span className="text-[10.5px] text-slate-400">Shared across Purchasing &amp; Maintenance</span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Vendor</th>
            <th className="px-3 py-2 text-left">Supplies</th>
            <th className="px-3 py-2 text-left">Used In</th>
            <th className="px-3 py-2 text-right">Spend</th>
          </tr>
        </thead>
        <tbody>
          {VENDORS.map((v) => (
            <tr key={v.name} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{v.name}</td>
              <td className="px-3 py-2 text-slate-500">{v.type}</td>
              <td className="px-3 py-2 text-slate-500">{v.used}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{v.spend}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
