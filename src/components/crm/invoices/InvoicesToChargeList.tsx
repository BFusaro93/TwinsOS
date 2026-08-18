"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAutopayInvoices, useChargeAutopayInvoice, type AutopayInvoice } from "@/lib/hooks/use-autopay-invoices";

function QueueTable({ invoices, isLoading }: { invoices: AutopayInvoice[]; isLoading: boolean }) {
  const chargeInvoice = useChargeAutopayInvoice();
  const [chargingId, setChargingId] = useState<string | null>(null);

  async function handleCharge(invoice: AutopayInvoice) {
    setChargingId(invoice.id);
    try {
      const result = await chargeInvoice.mutateAsync({ invoiceId: invoice.id });
      toast.success(
        `Charged ${invoice.clientName} ${formatCurrency(result.totalChargeCents)}${
          result.feeCents > 0 ? ` (incl. ${formatCurrency(result.feeCents)} fee)` : ""
        }`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to charge invoice");
    } finally {
      setChargingId(null);
    }
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-slate-400">Loading…</p>;
  }
  if (invoices.length === 0) {
    return <p className="p-6 text-sm text-slate-400">No invoices waiting to be charged.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="px-4 py-2">Client</th>
          <th className="px-4 py-2">Invoice #</th>
          <th className="px-4 py-2">Date</th>
          <th className="px-4 py-2">Payment Method</th>
          <th className="px-4 py-2 text-right">Balance</th>
          <th className="px-4 py-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id} className="border-b border-slate-100">
            <td className="px-4 py-2.5 font-medium text-slate-800">{inv.clientName}</td>
            <td className="px-4 py-2.5 text-slate-600">{inv.invoiceNumber}</td>
            <td className="px-4 py-2.5 text-slate-600">{inv.invoiceDate ? formatDate(inv.invoiceDate) : "—"}</td>
            <td className="px-4 py-2.5 text-slate-600">{inv.savedPaymentMethodSummary ?? "—"}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(inv.balanceCents)}</td>
            <td className="px-4 py-2.5 text-right">
              <Button
                size="sm"
                onClick={() => handleCharge(inv)}
                disabled={chargingId === inv.id}
              >
                {chargingId === inv.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Charge Now
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvoicesToChargeList() {
  const cardInvoices = useAutopayInvoices("card");
  const achInvoices = useAutopayInvoices("us_bank_account");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Invoices to Charge</h1>
          <p className="text-xs text-slate-500">
            Open invoices for clients with a card or bank account on file for autopay.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cardInvoices.refetch();
            achInvoices.refetch();
          }}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      <Tabs defaultValue="card" className="flex-1 overflow-auto">
        <TabsList className="mx-4 mt-3">
          <TabsTrigger value="card">Invoices to Charge ({cardInvoices.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="ach">ACH Invoices to Charge ({achInvoices.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="card" className="m-0">
          <QueueTable invoices={cardInvoices.data ?? []} isLoading={cardInvoices.isLoading} />
        </TabsContent>
        <TabsContent value="ach" className="m-0">
          <QueueTable invoices={achInvoices.data ?? []} isLoading={achInvoices.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
