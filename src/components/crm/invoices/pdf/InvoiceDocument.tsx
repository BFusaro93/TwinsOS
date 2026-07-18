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

// ── layout dispatch ──────────────────────────────────────────────────────────
// Add a new `case` here (and a matching sibling layout component above) when
// adding a new visual template — the DB only stores the layoutKey string.

function renderLayout(layoutKey: InvoicePDFLayoutKey, invoice: InvoicePDFData, org: OrgPDFData) {
  switch (layoutKey) {
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
