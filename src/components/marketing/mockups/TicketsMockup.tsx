const TICKETS = [
  { num: "#4821", subject: "Sprinkler zone 3 not turning off", client: "Whitmore Apartments", status: "Open", cls: "border-blue-200 bg-blue-50 text-blue-700", priority: "High" },
  { num: "#4819", subject: "Requesting mulch color change for spring", client: "Fell Custom Homes", status: "Waiting on Client", cls: "border-yellow-200 bg-yellow-100 text-yellow-700", priority: "Low" },
  { num: "#4815", subject: "Billing question — invoice #00512", client: "Cobblestone Plaza", status: "In Progress", cls: "border-brand-200 bg-brand-100 text-brand-800", priority: "Medium" },
  { num: "#4810", subject: "Damaged fence panel near loading dock", client: "Greenway Business Park", status: "Past Due", cls: "border-red-200 bg-red-100 text-red-700", priority: "High" },
  { num: "#4802", subject: "Confirm snow route for next storm", client: "Lakeside Medical Center", status: "Resolved", cls: "border-green-200 bg-green-100 text-green-800", priority: "Low" },
];

export function TicketsMockup() {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-[#eceae3] px-4 py-2.5">
        <span className="text-[13px] font-bold text-[#0a0a0a]">Tickets</span>
        <span className="text-[11px] text-slate-400">2 past due</span>
      </div>
      <table className="w-full min-w-[640px] text-[11px]">
        <thead className="bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2 text-left">#</th>
            <th className="px-1 py-2 text-left">Subject</th>
            <th className="px-1 py-2 text-left">Client</th>
            <th className="px-1 py-2 text-left">Priority</th>
            <th className="px-4 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {TICKETS.map((t) => (
            <tr key={t.num} className="border-t border-[#f0efe9] hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-400">{t.num}</td>
              <td className="px-1 py-2.5 font-medium text-[#0a0a0a]">{t.subject}</td>
              <td className="px-1 py-2.5 text-slate-500">{t.client}</td>
              <td className="px-1 py-2.5 text-slate-500">{t.priority}</td>
              <td className="px-4 py-2.5 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${t.cls}`}>{t.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
