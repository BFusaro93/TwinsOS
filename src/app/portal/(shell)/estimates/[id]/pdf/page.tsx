import { redirect, notFound } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PrintButton from "@/components/portal/PrintButton";

interface LineItem {
  id: string;
  estimate_desc: string | null;
  service_name: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  sort_order: number;
}

interface EstimateRow {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  portal_accepted_at: string | null;
  portal_signature_name: string | null;
  notes: string | null;
  show_discounts: boolean;
}

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function EstimatePdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const [estimateRes, clientRes, settingsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("estimates")
      .select("id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at, portal_accepted_at, portal_signature_name, notes, show_discounts")
      .eq("id", id)
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .single() as Promise<{ data: EstimateRow | null }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("clients")
      .select("display_name, billing_address_line1, billing_address_city, billing_address_state, billing_address_zip")
      .eq("id", ctx.clientId)
      .single() as Promise<{ data: { display_name: string | null; billing_address_line1: string | null; billing_address_city: string | null; billing_address_state: string | null; billing_address_zip: string | null } | null }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("company_name, support_email, support_phone, accent_color")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: { company_name: string | null; support_email: string | null; support_phone: string | null; accent_color: string } | null }>,
  ]);

  const estimate = estimateRes.data;
  if (!estimate) notFound();

  const client = clientRes.data;
  const settings = settingsRes.data;

  // Fetch line items separately (may not exist in all orgs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lineItems } = await (supabase as any)
    .from("estimate_line_items")
    .select("id, estimate_desc, service_name, quantity:qty, unit_price_cents:rate_cents, discount_cents, sort_order")
    .eq("estimate_id", id)
    .order("sort_order", { ascending: true }) as { data: LineItem[] | null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photoRows } = await (supabase as any)
    .from("estimate_photos")
    .select("id, storage_path, caption")
    .eq("estimate_id", id)
    .eq("customer_facing", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true }) as { data: { id: string; storage_path: string; caption: string | null }[] | null };

  const photos = await Promise.all(
    (photoRows ?? []).map(async (p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: signed } = await (supabase as any).storage
        .from("attachments")
        .createSignedUrl(p.storage_path, 3600);
      return { id: p.id, caption: p.caption, signedUrl: signed?.signedUrl ?? null };
    })
  );

  const accent = settings?.accent_color ?? "#60ab45";
  const companyName = settings?.company_name ?? "Your Service Provider";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 0.75in; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

      <PrintButton accent={accent} backHref="/portal/estimates" />

      <div className="max-w-2xl mx-auto py-8 px-4 print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div
              className="inline-block h-10 w-10 rounded-lg text-white text-lg font-bold flex items-center justify-center mb-2"
              style={{ backgroundColor: accent }}
            >
              {companyName.charAt(0)}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{companyName}</h1>
            {settings?.support_email && <p className="text-xs text-slate-500">{settings.support_email}</p>}
            {settings?.support_phone && <p className="text-xs text-slate-500">{settings.support_phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">ESTIMATE</p>
            <p className="text-sm text-slate-500 mt-1">#{estimate.estimate_number}</p>
            <p className="text-xs text-slate-400 mt-0.5">Issued {fmtDate(estimate.created_at)}</p>
            {estimate.expires_at && (
              <p className="text-xs text-slate-400">Expires {fmtDate(estimate.expires_at)}</p>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Prepared For</p>
          <p className="text-sm font-semibold text-slate-900">{client?.display_name ?? ""}</p>
          {client?.billing_address_line1 && <p className="text-sm text-slate-600">{client.billing_address_line1}</p>}
          {client?.billing_address_city && (
            <p className="text-sm text-slate-600">
              {client.billing_address_city}{client.billing_address_state ? `, ${client.billing_address_state}` : ""}{client.billing_address_zip ? ` ${client.billing_address_zip}` : ""}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 mb-6" />

        {/* Title */}
        {estimate.title && (
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{estimate.title}</h2>
        )}

        {/* Line items table */}
        {lineItems && lineItems.length > 0 ? (
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="text-center py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Qty</th>
                <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Unit</th>
                <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="py-2.5 text-slate-700">{li.estimate_desc ?? li.service_name}</td>
                  <td className="py-2.5 text-center text-slate-600">{li.quantity}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmt(li.unit_price_cents)}</td>
                  <td className="py-2.5 text-right font-medium text-slate-900">
                    {fmt(li.unit_price_cents * li.quantity - (li.discount_cents ?? 0))}
                    {estimate.show_discounts && li.discount_cents > 0 && (
                      <div className="text-[10px] font-normal text-green-600">−{fmt(li.discount_cents)} disc.</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td colSpan={3} className="pt-3 text-right text-sm font-bold text-slate-900">Total</td>
                <td className="pt-3 text-right text-base font-bold text-slate-900">{fmt(estimate.total_price_cents)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="flex items-center justify-between py-4 border-b border-slate-200 mb-6">
            <span className="text-sm text-slate-700">Services as described</span>
            <span className="text-lg font-bold text-slate-900">{fmt(estimate.total_price_cents)}</span>
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Photos</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {photo.signedUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.signedUrl} alt={photo.caption ?? ""} className="aspect-square w-full object-cover" />
                  )}
                  {photo.caption && (
                    <p className="px-2 py-1.5 text-center text-xs text-slate-500">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {estimate.notes && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 mb-6">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="whitespace-pre-wrap">{estimate.notes}</p>
          </div>
        )}

        {/* Signature block */}
        {estimate.portal_accepted_at && estimate.portal_signature_name ? (
          <div className="border border-green-200 bg-green-50 rounded-xl px-4 py-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Electronically Accepted</p>
            <p className="text-lg font-medium text-green-900" style={{ fontFamily: "cursive" }}>
              {estimate.portal_signature_name}
            </p>
            <p className="text-xs text-green-700 mt-1">
              Signed on {fmtDate(estimate.portal_accepted_at)} via client portal
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl px-4 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Acceptance</p>
            <div className="border-b border-slate-300 mb-1 h-8" />
            <p className="text-xs text-slate-400">Authorized Signature · Date</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>{companyName}{settings?.support_email ? ` · ${settings.support_email}` : ""}{settings?.support_phone ? ` · ${settings.support_phone}` : ""}</p>
        </div>
      </div>
    </>
  );
}
