import { CreditCard, Building2 } from "lucide-react";

const INVOICES = [
  { num: "INV-1042", client: "Lakeside HOA", amt: "$1,240.00", status: "Paid", cls: "border-green-200 bg-green-100 text-green-800" },
  { num: "INV-1043", client: "Whitmore Apartments", amt: "$380.00", status: "Paid", cls: "border-green-200 bg-green-100 text-green-800" },
  { num: "INV-1044", client: "Cobblestone Plaza", amt: "$540.00", status: "Sent", cls: "border-blue-200 bg-blue-100 text-blue-800" },
  { num: "INV-1045", client: "Greenway Business Park", amt: "$2,600.00", status: "Overdue", cls: "border-red-200 bg-red-100 text-red-800" },
];

export function InvoicingMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Invoices</div>
        <span className="text-[10.5px] text-slate-400">$4,760.00 this week</span>
      </div>

      <table className="mb-4 w-full text-[11px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left">Invoice</th>
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {INVOICES.map((i) => (
            <tr key={i.num} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-700">{i.num}</td>
              <td className="px-3 py-2 text-slate-500">{i.client}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{i.amt}</td>
              <td className="px-3 py-2 text-right">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${i.cls}`}>{i.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">
          INV-1044 — Cobblestone Plaza
        </div>
        <div className="mb-2.5 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Balance due</span>
          <span className="font-semibold text-slate-800">$540.00</span>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#635BFF] py-2 text-[10.5px] font-semibold text-white">
            <CreditCard className="h-3 w-3" />
            Pay with card
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white py-2 text-[10.5px] font-semibold text-slate-600">
            <Building2 className="h-3 w-3" />
            Pay by bank
          </div>
        </div>
      </div>
    </div>
  );
}
