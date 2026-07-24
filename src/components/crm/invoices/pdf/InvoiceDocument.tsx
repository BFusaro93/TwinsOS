import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { BILLING_TERMS_OPTIONS } from "@/lib/constants";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";

// ── types ────────────────────────────────────────────────────────────────────

export interface InvoicePDFLineItem {
  name: string | null;
  description: string;
  qty: number;
  rateCents: number;
  totalCents: number;
}

export interface InvoicePDFData {
  invoiceNumber: number;
  description: string | null;
  invoiceDate: string;
  dueDate: string | null;
  poNumber: string | null;
  terms: string | null;
  notes: string | null;

  clientName: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientState: string | null;
  clientZip: string | null;

  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;

  lineItems: InvoicePDFLineItem[];
}

export interface OrgPDFData {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  brandColor: string;
  logoUrl: string | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function cents(n: number): string {
  return "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + "%";
}

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: "#ffffff",
  },

  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  logo: { width: 120, height: 48, objectFit: "contain", objectPositionX: "left" },
  logoPlaceholder: { width: 120 },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyMeta: { fontSize: 8, color: "#64748b", lineHeight: 1.5 },

  titleBand: { borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleText: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 1 },
  invoiceNumBlock: { alignItems: "flex-end" },
  invoiceNumLabel: { fontSize: 7, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5, textTransform: "uppercase" },
  invoiceNumValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },

  addressRow: { flexDirection: "row", marginBottom: 20, gap: 16 },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  addressName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  addressLine: { fontSize: 8.5, color: "#475569", lineHeight: 1.5 },

  metaRow: { flexDirection: "row", gap: 16, marginBottom: 20 },
  metaCell: { flex: 1, borderTop: "1 solid #e2e8f0", paddingTop: 6 },
  metaLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  tableHeader: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderRadius: 2 },
  tableHeaderText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.3 },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottom: "1 solid #f1f5f9" },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  cellService: { flex: 3 },
  cellNum: { flex: 1, textAlign: "right" },
  cellTotal: { flex: 1.2, textAlign: "right" },
  serviceNameText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  serviceDescText: { fontSize: 7.5, color: "#64748b", marginTop: 2, lineHeight: 1.4 },
  cellText: { fontSize: 9, color: "#334155" },

  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 8.5, color: "#475569" },
  totalsValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  totalDivider: { width: 220, borderTop: "1 solid #e2e8f0", marginVertical: 4 },
  grandTotalRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 4 },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  balanceDueRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 3, marginTop: 6 },
  balanceDueLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  balanceDueValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },

  notesSection: { marginTop: 24, borderTop: "1 solid #e2e8f0", paddingTop: 12 },
  notesLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  notesText: { fontSize: 8.5, color: "#475569", lineHeight: 1.6 },

  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #e2e8f0", paddingTop: 8 },
  footerText: { fontSize: 7, color: "#94a3b8" },
});

// ── default layout ───────────────────────────────────────────────────────────

function DefaultInvoiceLayout({ invoice, org }: { invoice: InvoicePDFData; org: OrgPDFData }) {
  const accentColor = org.brandColor || "#60ab45";

  const clientAddressLine2 = [invoice.clientCity, invoice.clientState, invoice.clientZip]
    .filter(Boolean)
    .join(", ");

  const orgAddressLine2 = [org.city, org.state, org.zip].filter(Boolean).join(", ");

  return (
    <Page size="LETTER" style={S.page}>

      {/* ── header ─────────────────────────────────────────────────── */}
      <View style={S.header}>
        <View style={S.logoPlaceholder}>
          {org.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={org.logoUrl} style={S.logo} />
          ) : (
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: accentColor }}>
              {org.name}
            </Text>
          )}
        </View>
        <View style={S.companyBlock}>
          {org.logoUrl && <Text style={S.companyName}>{org.name}</Text>}
          <Text style={S.companyMeta}>{org.street}</Text>
          {orgAddressLine2 ? <Text style={S.companyMeta}>{orgAddressLine2}</Text> : null}
          {org.phone ? <Text style={S.companyMeta}>{org.phone}</Text> : null}
        </View>
      </View>

      {/* ── title band ─────────────────────────────────────────────── */}
      <View style={[S.titleBand, { backgroundColor: accentColor }]}>
        <Text style={S.titleText}>INVOICE</Text>
        <View style={S.invoiceNumBlock}>
          <Text style={S.invoiceNumLabel}>Invoice No.</Text>
          <Text style={S.invoiceNumValue}>#{String(invoice.invoiceNumber).padStart(5, "0")}</Text>
        </View>
      </View>

      {/* ── address row ────────────────────────────────────────────── */}
      <View style={S.addressRow}>
        <View style={S.addressBlock}>
          <Text style={S.addressLabel}>Bill To</Text>
          <Text style={S.addressName}>{invoice.clientName ?? "—"}</Text>
          {invoice.clientAddress ? <Text style={S.addressLine}>{invoice.clientAddress}</Text> : null}
          {clientAddressLine2 ? <Text style={S.addressLine}>{clientAddressLine2}</Text> : null}
        </View>
        <View style={S.addressBlock}>
          {invoice.description ? (
            <>
              <Text style={S.addressLabel}>Description</Text>
              <Text style={[S.addressLine, { color: "#1e293b" }]}>{invoice.description}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* ── meta row ───────────────────────────────────────────────── */}
      <View style={S.metaRow}>
        <View style={S.metaCell}>
          <Text style={S.metaLabel}>Invoice Date</Text>
          <Text style={S.metaValue}>{formatDate(invoice.invoiceDate)}</Text>
        </View>
        {invoice.dueDate ? (
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Due Date</Text>
            <Text style={S.metaValue}>{formatDate(invoice.dueDate)}</Text>
          </View>
        ) : <View style={S.metaCell} />}
        {invoice.terms ? (
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Terms</Text>
            <Text style={S.metaValue}>
              {BILLING_TERMS_OPTIONS.find((o) => o.value === invoice.terms)?.label ?? invoice.terms}
            </Text>
          </View>
        ) : <View style={S.metaCell} />}
        {invoice.poNumber ? (
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>PO Number</Text>
            <Text style={S.metaValue}>{invoice.poNumber}</Text>
          </View>
        ) : <View style={S.metaCell} />}
      </View>

      {/* ── line items ─────────────────────────────────────────────── */}
      <View style={[S.tableHeader, { backgroundColor: accentColor }]}>
        <View style={S.cellService}><Text style={S.tableHeaderText}>Description</Text></View>
        <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Qty</Text></View>
        <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Rate</Text></View>
        <View style={S.cellTotal}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Total</Text></View>
      </View>

      {invoice.lineItems.map((li, i) => (
        <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
          <View style={S.cellService}>
            <Text style={S.serviceNameText}>{li.name ?? "Service"}</Text>
            {li.description ? (
              <Text style={S.serviceDescText}>{li.description.replace(/<[^>]+>/g, "")}</Text>
            ) : null}
          </View>
          <View style={S.cellNum}><Text style={S.cellText}>{li.qty.toLocaleString()}</Text></View>
          <View style={S.cellNum}><Text style={S.cellText}>{cents(li.rateCents)}</Text></View>
          <View style={S.cellTotal}><Text style={[S.cellText, { textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{cents(li.totalCents)}</Text></View>
        </View>
      ))}

      {/* ── totals ─────────────────────────────────────────────────── */}
      <View style={S.totalsBlock}>
        <View style={S.totalsRow}>
          <Text style={S.totalsLabel}>Subtotal</Text>
          <Text style={S.totalsValue}>{cents(invoice.subtotalCents)}</Text>
        </View>
        {invoice.discountCents > 0 && (
          <View style={S.totalsRow}>
            <Text style={[S.totalsLabel, { color: "#16a34a" }]}>Discount</Text>
            <Text style={[S.totalsValue, { color: "#16a34a" }]}>-{cents(invoice.discountCents)}</Text>
          </View>
        )}
        {invoice.taxRateBps > 0 && (
          <View style={S.totalsRow}>
            <Text style={S.totalsLabel}>Tax ({bpsToPercent(invoice.taxRateBps)})</Text>
            <Text style={S.totalsValue}>{cents(invoice.taxCents)}</Text>
          </View>
        )}
        <View style={S.totalDivider} />
        <View style={S.grandTotalRow}>
          <Text style={S.grandTotalLabel}>Total</Text>
          <Text style={[S.grandTotalValue, { color: accentColor }]}>{cents(invoice.totalCents)}</Text>
        </View>
        {invoice.amountPaidCents > 0 && (
          <View style={S.totalsRow}>
            <Text style={S.totalsLabel}>Amount Paid</Text>
            <Text style={S.totalsValue}>-{cents(invoice.amountPaidCents)}</Text>
          </View>
        )}
        <View style={[S.balanceDueRow, { backgroundColor: accentColor }]}>
          <Text style={S.balanceDueLabel}>Balance Due</Text>
          <Text style={S.balanceDueValue}>{cents(invoice.balanceCents)}</Text>
        </View>
      </View>

      {/* ── notes ──────────────────────────────────────────────────── */}
      {invoice.notes ? (
        <View style={S.notesSection}>
          <Text style={S.notesLabel}>Notes</Text>
          <Text style={S.notesText}>{invoice.notes}</Text>
        </View>
      ) : null}

      {/* ── footer ─────────────────────────────────────────────────── */}
      <View style={S.footer} fixed>
        <Text style={S.footerText}>{org.name} · {org.phone}</Text>
        <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>

    </Page>
  );
}

// ── compact layout ───────────────────────────────────────────────────────────
// A denser, monochrome, single-page-oriented alternative to the default —
// no colored bands, tighter row spacing, smaller type.

const SC = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.5, color: "#111827", padding: 32, backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2 solid #111827", paddingBottom: 10, marginBottom: 14 },
  logo: { width: 90, height: 36, objectFit: "contain", objectPositionX: "left" },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  companyMeta: { fontSize: 7.5, color: "#4b5563", lineHeight: 1.4 },
  titleBlock: { alignItems: "flex-end" },
  titleText: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  invoiceNum: { fontSize: 8.5, color: "#4b5563", marginTop: 2 },
  metaLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  metaItem: { fontSize: 7.5, color: "#4b5563" },
  metaItemLabel: { fontFamily: "Helvetica-Bold", color: "#111827" },
  billTo: { marginBottom: 12 },
  billToLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  billToName: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  billToLine: { fontSize: 8, color: "#374151" },
  tableHeaderRow: { flexDirection: "row", borderBottom: "1 solid #111827", paddingBottom: 4, marginBottom: 4 },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3, color: "#374151" },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5 solid #e5e7eb" },
  cellDesc: { flex: 3 },
  cellNum: { flex: 1, textAlign: "right" },
  cellTotal: { flex: 1.1, textAlign: "right" },
  itemName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  itemDesc: { fontSize: 7, color: "#6b7280", marginTop: 1 },
  cellText: { fontSize: 8, color: "#1f2937" },
  totals: { marginTop: 10, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 180, justifyContent: "space-between", paddingVertical: 2 },
  totalsLabel: { fontSize: 8, color: "#4b5563" },
  totalsValue: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  divider: { width: 180, borderTop: "1 solid #111827", marginVertical: 3 },
  grandRow: { flexDirection: "row", width: 180, justifyContent: "space-between", paddingVertical: 3 },
  grandLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  balanceRow: { flexDirection: "row", width: 180, justifyContent: "space-between", paddingVertical: 3, borderTop: "2 solid #111827", marginTop: 2 },
  balanceLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  balanceValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 16, fontSize: 7.5, color: "#4b5563" },
  notesLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#111827", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: "#9ca3af" },
});

function CompactInvoiceLayout({ invoice, org }: { invoice: InvoicePDFData; org: OrgPDFData }) {
  const accentColor = org.brandColor || "#60ab45";
  const clientAddressLine2 = [invoice.clientCity, invoice.clientState, invoice.clientZip].filter(Boolean).join(", ");
  const orgAddressLine2 = [org.city, org.state, org.zip].filter(Boolean).join(", ");

  return (
    <Page size="LETTER" style={SC.page}>
      <View style={SC.header}>
        <View>
          {org.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={org.logoUrl} style={SC.logo} />
          ) : (
            <Text style={SC.companyName}>{org.name}</Text>
          )}
          <Text style={SC.companyMeta}>{org.street}</Text>
          {orgAddressLine2 ? <Text style={SC.companyMeta}>{orgAddressLine2}</Text> : null}
          {org.phone ? <Text style={SC.companyMeta}>{org.phone}</Text> : null}
        </View>
        <View style={SC.titleBlock}>
          <Text style={SC.titleText}>INVOICE</Text>
          <Text style={SC.invoiceNum}>#{String(invoice.invoiceNumber).padStart(5, "0")}</Text>
        </View>
      </View>

      <View style={SC.metaLine}>
        <Text style={SC.metaItem}><Text style={SC.metaItemLabel}>Date: </Text>{formatDate(invoice.invoiceDate)}</Text>
        {invoice.dueDate ? <Text style={SC.metaItem}><Text style={SC.metaItemLabel}>Due: </Text>{formatDate(invoice.dueDate)}</Text> : null}
        {invoice.terms ? (
          <Text style={SC.metaItem}>
            <Text style={SC.metaItemLabel}>Terms: </Text>
            {BILLING_TERMS_OPTIONS.find((o) => o.value === invoice.terms)?.label ?? invoice.terms}
          </Text>
        ) : null}
        {invoice.poNumber ? <Text style={SC.metaItem}><Text style={SC.metaItemLabel}>PO: </Text>{invoice.poNumber}</Text> : null}
      </View>

      <View style={SC.billTo}>
        <Text style={SC.billToLabel}>Bill To</Text>
        <Text style={SC.billToName}>{invoice.clientName ?? "—"}</Text>
        {invoice.clientAddress ? <Text style={SC.billToLine}>{invoice.clientAddress}</Text> : null}
        {clientAddressLine2 ? <Text style={SC.billToLine}>{clientAddressLine2}</Text> : null}
        {invoice.description ? <Text style={[SC.billToLine, { marginTop: 3 }]}>{invoice.description}</Text> : null}
      </View>

      <View style={SC.tableHeaderRow}>
        <View style={SC.cellDesc}><Text style={SC.tableHeaderText}>Description</Text></View>
        <View style={SC.cellNum}><Text style={SC.tableHeaderText}>Qty</Text></View>
        <View style={SC.cellNum}><Text style={SC.tableHeaderText}>Rate</Text></View>
        <View style={SC.cellTotal}><Text style={SC.tableHeaderText}>Total</Text></View>
      </View>

      {invoice.lineItems.map((li, i) => (
        <View key={i} style={SC.row}>
          <View style={SC.cellDesc}>
            <Text style={SC.itemName}>{li.name ?? "Service"}</Text>
            {li.description ? <Text style={SC.itemDesc}>{li.description.replace(/<[^>]+>/g, "")}</Text> : null}
          </View>
          <View style={SC.cellNum}><Text style={SC.cellText}>{li.qty.toLocaleString()}</Text></View>
          <View style={SC.cellNum}><Text style={SC.cellText}>{cents(li.rateCents)}</Text></View>
          <View style={SC.cellTotal}><Text style={[SC.cellText, { fontFamily: "Helvetica-Bold" }]}>{cents(li.totalCents)}</Text></View>
        </View>
      ))}

      <View style={SC.totals}>
        <View style={SC.totalsRow}>
          <Text style={SC.totalsLabel}>Subtotal</Text>
          <Text style={SC.totalsValue}>{cents(invoice.subtotalCents)}</Text>
        </View>
        {invoice.discountCents > 0 && (
          <View style={SC.totalsRow}>
            <Text style={SC.totalsLabel}>Discount</Text>
            <Text style={SC.totalsValue}>-{cents(invoice.discountCents)}</Text>
          </View>
        )}
        {invoice.taxRateBps > 0 && (
          <View style={SC.totalsRow}>
            <Text style={SC.totalsLabel}>Tax ({bpsToPercent(invoice.taxRateBps)})</Text>
            <Text style={SC.totalsValue}>{cents(invoice.taxCents)}</Text>
          </View>
        )}
        <View style={SC.divider} />
        <View style={SC.grandRow}>
          <Text style={SC.grandLabel}>Total</Text>
          <Text style={[SC.grandValue, { color: accentColor }]}>{cents(invoice.totalCents)}</Text>
        </View>
        {invoice.amountPaidCents > 0 && (
          <View style={SC.totalsRow}>
            <Text style={SC.totalsLabel}>Amount Paid</Text>
            <Text style={SC.totalsValue}>-{cents(invoice.amountPaidCents)}</Text>
          </View>
        )}
        <View style={SC.balanceRow}>
          <Text style={SC.balanceLabel}>Balance Due</Text>
          <Text style={[SC.balanceValue, { color: accentColor }]}>{cents(invoice.balanceCents)}</Text>
        </View>
      </View>

      {invoice.notes ? (
        <View style={SC.notes}>
          <Text style={SC.notesLabel}>Notes</Text>
          <Text>{invoice.notes}</Text>
        </View>
      ) : null}

      <View style={SC.footer} fixed>
        <Text>{org.name} · {org.phone}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

// ── layout dispatch ──────────────────────────────────────────────────────────
// Add a new `case` here (and a matching sibling layout component above) when
// adding a new visual template — the DB only stores the layoutKey string.

function renderLayout(layoutKey: InvoicePDFLayoutKey, invoice: InvoicePDFData, org: OrgPDFData) {
  switch (layoutKey) {
    case "compact":
      return <CompactInvoiceLayout invoice={invoice} org={org} />;
    case "default":
    default:
      return <DefaultInvoiceLayout invoice={invoice} org={org} />;
  }
}

export function InvoiceDocument({
  invoice,
  org,
  layoutKey = "default",
}: {
  invoice: InvoicePDFData;
  org: OrgPDFData;
  layoutKey?: InvoicePDFLayoutKey;
}) {
  return (
    <Document title={`Invoice #${invoice.invoiceNumber}`} author={org.name}>
      {renderLayout(layoutKey, invoice, org)}
    </Document>
  );
}
