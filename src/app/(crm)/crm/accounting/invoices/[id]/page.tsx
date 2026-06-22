import { InvoiceDetail } from "@/components/crm/invoices/InvoiceDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  return <InvoiceDetail invoiceId={id} />;
}
