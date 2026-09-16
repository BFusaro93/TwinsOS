import { isoNy } from "@/lib/reports/ny-date";
import type { InvoicePDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";

/** Sample invoice used to render template/layout previews without needing a
 *  real invoice on file — same shape the real invoice PDF route builds. */
export const SAMPLE_INVOICE: Omit<InvoicePDFData, "invoiceNumber" | "invoiceDate"> = {
  description: "Sample Invoice",
  dueDate: null,
  poNumber: null,
  terms: "Due on receipt",
  notes: "Thank you for your business! This is a sample note to show where notes appear on the invoice.",
  clientName: "Jane Sample Client",
  clientAddress: "123 Example Street",
  clientCity: "Springfield",
  clientState: "MA",
  clientZip: "01101",
  subtotalCents: 45000,
  taxRateBps: 625,
  taxCents: 2813,
  discountCents: 0,
  totalCents: 47813,
  amountPaidCents: 0,
  balanceCents: 47813,
  lineItems: [
    { name: "Lawn Mowing", description: "Weekly mowing service", qty: 4, rateCents: 7500, totalCents: 30000 },
    { name: "Mulch Install", description: "3 yards double-shredded mulch", qty: 1, rateCents: 15000, totalCents: 15000 },
  ],
  statement: {
    accountNumber: "10042",
    previousBalanceCents: 47813,
    accountBalanceCents: 95626,
    lastPayment: { amountCents: 47813, date: isoNy(new Date()), reference: "7219443587" },
    priorInvoices: [
      {
        invoiceNumber: 1000,
        amountCents: 47813,
        date: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
        daysPastDue: 1,
      },
      {
        invoiceNumber: 998,
        amountCents: 12500,
        date: new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10),
        daysPastDue: 31,
      },
    ],
  },
};
