"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

/** One row behind a Spend stat card: a PO line item, or a whole PO. */
export interface SpendDetailRow {
  key: string;
  date: string;
  poId: string;
  poNumber: string;
  vendor: string;
  /** Set on whole-PO rows. */
  status?: string;
  /** Set on line-item rows. */
  item?: string;
  partNumber?: string;
  basis?: string;
  cents: number;
}

export interface SpendDetail {
  title: string;
  description: string;
  rows: SpendDetailRow[];
}

/** The POs or PO line items that add up to one of the Parts Spend stat cards. */
export function SpendDetailDialog({ detail, onClose }: { detail: SpendDetail | null; onClose: () => void }) {
  const rows = detail?.rows ?? [];
  const hasItems = rows.some((r) => r.item !== undefined);
  const hasStatus = rows.some((r) => r.status !== undefined);

  return (
    <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{detail?.title}</DialogTitle>
          <DialogDescription>{detail?.description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(85vh-96px)] overflow-auto px-6 pb-6">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Nothing recorded in this range</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">PO</th>
                  <th className="py-2 pr-3 font-semibold">Vendor</th>
                  {hasStatus && <th className="py-2 pr-3 font-semibold">Status</th>}
                  {hasItems && <th className="py-2 pr-3 font-semibold">Item</th>}
                  {hasItems && <th className="py-2 pr-3 text-right font-semibold">Basis</th>}
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{formatDate(r.date)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/po/orders?id=${r.poId}`} className="font-medium text-blue-600 hover:underline">
                        {r.poNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{r.vendor}</td>
                    {hasStatus && <td className="py-2 pr-3 capitalize text-slate-500">{r.status?.replace(/_/g, " ")}</td>}
                    {hasItems && (
                      <td className="py-2 pr-3 text-slate-700">
                        {r.item}
                        {r.partNumber && <span className="block text-xs text-slate-400">{r.partNumber}</span>}
                      </td>
                    )}
                    {hasItems && <td className="whitespace-nowrap py-2 pr-3 text-right text-slate-500">{r.basis}</td>}
                    <td className="whitespace-nowrap py-2 text-right font-medium text-slate-900">{formatCurrency(r.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
