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

  /** Template-level marketing/service-update blurb — same on every invoice
   *  using that template (e.g. "We now offer junk removal!"). */
  advertisementText?: string | null;

  /** Public, unauthenticated "view + pay online" link for this invoice. */
  viewOnlineUrl?: string | null;

  /** Only populated for the "statement" layout — account-activity context
   *  (previous balance, last payment, prior invoice) beyond this one invoice. */
  statement?: InvoicePDFStatementData | null;
}

export interface InvoicePDFStatementData {
  accountNumber: string | null;
  /** The client's total outstanding balance across every OTHER open invoice,
   *  i.e. what they owed before this invoice was added. */
  previousBalanceCents: number;
  /** previousBalanceCents + this invoice's own outstanding balance. */
  accountBalanceCents: number;
  lastPayment: { amountCents: number; date: string; reference: string | null } | null;
  priorInvoice: { invoiceNumber: number; amountCents: number; date: string; daysPastDue: number } | null;
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

      {/* ── advertisement ──────────────────────────────────────────── */}
      {invoice.advertisementText ? (
        <View style={S.notesSection}>
          <Text style={S.notesText}>{invoice.advertisementText?.replace(/<[^>]+>/g, "")}</Text>
        </View>
      ) : null}

      {/* ── notes ──────────────────────────────────────────────────── */}
      {invoice.notes ? (
        <View style={S.notesSection}>
          <Text style={S.notesLabel}>Notes</Text>
          <Text style={S.notesText}>{invoice.notes?.replace(/<[^>]+>/g, "")}</Text>
        </View>
      ) : null}

      {/* ── view online ────────────────────────────────────────────── */}
      {invoice.viewOnlineUrl ? (
        <View style={S.notesSection}>
          <Text style={S.notesLabel}>View &amp; Pay Online</Text>
          <Text style={S.notesText}>{invoice.viewOnlineUrl}</Text>
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

      {invoice.advertisementText ? (
        <View style={SC.notes}>
          <Text>{invoice.advertisementText?.replace(/<[^>]+>/g, "")}</Text>
        </View>
      ) : null}

      {invoice.notes ? (
        <View style={SC.notes}>
          <Text style={SC.notesLabel}>Notes</Text>
          <Text>{invoice.notes?.replace(/<[^>]+>/g, "")}</Text>
        </View>
      ) : null}

      {invoice.viewOnlineUrl ? (
        <View style={SC.notes}>
          <Text style={SC.notesLabel}>View &amp; Pay Online</Text>
          <Text>{invoice.viewOnlineUrl}</Text>
        </View>
      ) : null}

      <View style={SC.footer} fixed>
        <Text>{org.name} · {org.phone}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

// ── statement layout ─────────────────────────────────────────────────────────
// Account-statement style — running balance, prior invoice/payment activity,
// and a payment stub — modeled after the org's existing paper statement
// format rather than a single-invoice line-item sheet.

const SS = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.5, color: "#1e293b", padding: 32, backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  fromBlock: { flexDirection: "column" },
  fromLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  companyMeta: { fontSize: 7.5, color: "#4b5563", lineHeight: 1.4 },
  logo: { width: 100, height: 40, objectFit: "contain", objectPositionX: "right" },

  addressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  toBlock: { flexDirection: "column", maxWidth: 260 },
  toLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  toName: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  toLine: { fontSize: 8, color: "#374151" },

  summaryTables: { flexDirection: "column", width: 220 },
  miniTable: { borderTop: "1 solid #cbd5e1", borderLeft: "1 solid #cbd5e1", borderRight: "1 solid #cbd5e1" },
  miniRow: { flexDirection: "row", borderBottom: "1 solid #cbd5e1" },
  miniCellLabel: { flex: 1.4, backgroundColor: "#f0fdf4", padding: 4, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#166534" },
  miniCellValue: { flex: 1, padding: 4, fontSize: 7.5, textAlign: "right" },
  balanceLabel: { flex: 1.4, backgroundColor: "#f0fdf4", padding: 4, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#166534" },
  balanceValue: { flex: 1, padding: 4, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#b91c1c", textAlign: "right" },
  spacer: { height: 8 },

  invoiceForRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 8, fontSize: 7.5 },
  invoiceForLabel: { fontFamily: "Helvetica-Bold" },

  activityHeaderRow: { flexDirection: "row", backgroundColor: "#166534", paddingVertical: 4, paddingHorizontal: 6 },
  activityHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase" },
  activityRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6, borderBottom: "1 solid #f1f5f9" },
  activityDividerRow: { flexDirection: "row", paddingVertical: 3, borderTop: "1 solid #cbd5e1", borderBottom: "1 solid #cbd5e1", backgroundColor: "#f8fafc" },
  activityDividerText: { fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", color: "#475569" },
  cellDate: { flex: 1 },
  cellDesc: { flex: 3.5 },
  cellQty: { flex: 0.6, textAlign: "right" },
  cellPrice: { flex: 1, textAlign: "right" },
  cellTotal: { flex: 1, textAlign: "right" },
  activityText: { fontSize: 7.5, color: "#334155" },

  onlineBox: { marginTop: 14, backgroundColor: "#f0fdf4", padding: 8, borderRadius: 2 },
  onlineBoxLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#166534", marginBottom: 2 },
  onlineBoxText: { fontSize: 7, color: "#166534" },

  termsSection: { marginTop: 14 },
  termsText: { fontSize: 7, color: "#b91c1c", lineHeight: 1.5 },

  stub: { marginTop: 18, borderTop: "2 solid #166534", paddingTop: 10, flexDirection: "row", justifyContent: "space-between" },
  stubLeft: { flexDirection: "column" },
  stubRow: { flexDirection: "row", marginBottom: 2 },
  stubLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", width: 70 },
  stubValue: { fontSize: 7.5 },
  stubTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#166534" },
  stubRight: { flexDirection: "column", alignItems: "flex-end" },

  footer: { position: "absolute", bottom: 16, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: "#9ca3af" },
});

function daysPastDueLabel(days: number): string {
  if (days <= 0) return "";
  return ` -- ${days} DAY${days === 1 ? "" : "S"} PAST DUE`;
}

function StatementInvoiceLayout({
  invoice,
  org,
  showAccountBalance = true,
}: {
  invoice: InvoicePDFData;
  org: OrgPDFData;
  /** false = highlight this invoice's own total/balance instead of the
   *  running account balance across all the client's other invoices. */
  showAccountBalance?: boolean;
}) {
  const st = invoice.statement;
  const clientAddressLine2 = [invoice.clientCity, invoice.clientState, invoice.clientZip].filter(Boolean).join(", ");
  const orgAddressLine2 = [org.city, org.state, org.zip].filter(Boolean).join(", ");
  const invoiceLabel = `#${String(invoice.invoiceNumber).padStart(5, "0")}`;

  return (
    <Page size="LETTER" style={SS.page}>
      <View style={SS.header}>
        <View style={SS.fromBlock}>
          <Text style={SS.fromLabel}>From</Text>
          <Text style={SS.companyName}>{org.name}</Text>
          <Text style={SS.companyMeta}>{org.street}</Text>
          {orgAddressLine2 ? <Text style={SS.companyMeta}>{orgAddressLine2}</Text> : null}
          {org.phone ? <Text style={SS.companyMeta}>{org.phone}</Text> : null}
        </View>
        {org.logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={org.logoUrl} style={SS.logo} />
        ) : null}
      </View>

      <View style={SS.addressRow}>
        <View style={SS.toBlock}>
          <Text style={SS.toLabel}>To</Text>
          <Text style={SS.toName}>{invoice.clientName ?? "—"}</Text>
          {invoice.clientAddress ? <Text style={SS.toLine}>{invoice.clientAddress}</Text> : null}
          {clientAddressLine2 ? <Text style={SS.toLine}>{clientAddressLine2}</Text> : null}
        </View>

        <View style={SS.summaryTables}>
          <View style={SS.miniTable}>
            <View style={SS.miniRow}>
              <View style={SS.miniCellLabel}><Text>Invoice #</Text></View>
              <View style={SS.miniCellValue}><Text>{invoiceLabel}</Text></View>
            </View>
            <View style={[SS.miniRow, { borderBottom: "none" }]}>
              <View style={SS.miniCellLabel}><Text>Invoice Date</Text></View>
              <View style={SS.miniCellValue}><Text>{formatDate(invoice.invoiceDate)}</Text></View>
            </View>
          </View>
          <View style={SS.spacer} />
          <View style={SS.miniTable}>
            {st?.lastPayment ? (
              <View style={SS.miniRow}>
                <View style={SS.miniCellLabel}><Text>Last Payment Received</Text></View>
                <View style={SS.miniCellValue}><Text>{cents(st.lastPayment.amountCents)}</Text></View>
              </View>
            ) : null}
            {showAccountBalance && (
              <>
                <View style={SS.miniRow}>
                  <View style={SS.miniCellLabel}><Text>Previous Balance</Text></View>
                  <View style={SS.miniCellValue}><Text>{cents(st?.previousBalanceCents ?? 0)}</Text></View>
                </View>
                <View style={SS.miniRow}>
                  {/* invoice.totalCents is already tax-inclusive — shown here
                      (not as a separate Sales Tax line) so this column adds
                      up to Account Balance exactly: Previous + This Invoice. */}
                  <View style={SS.miniCellLabel}><Text>Invoice {invoiceLabel} Total</Text></View>
                  <View style={SS.miniCellValue}><Text>{cents(invoice.totalCents)}</Text></View>
                </View>
              </>
            )}
            <View style={[SS.miniRow, { borderBottom: "none" }]}>
              {showAccountBalance ? (
                <>
                  <View style={SS.balanceLabel}><Text>Account Balance</Text></View>
                  <View style={SS.balanceValue}><Text>{cents(st?.accountBalanceCents ?? invoice.totalCents)}</Text></View>
                </>
              ) : (
                <>
                  <View style={SS.balanceLabel}><Text>Balance Due</Text></View>
                  <View style={SS.balanceValue}><Text>{cents(invoice.balanceCents)}</Text></View>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={SS.invoiceForRow}>
        <Text><Text style={SS.invoiceForLabel}>Invoice For: </Text>{invoice.description ?? invoice.clientName ?? "—"}</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {invoice.poNumber ? <Text><Text style={SS.invoiceForLabel}>PO #: </Text>{invoice.poNumber}</Text> : null}
          {st?.accountNumber ? <Text><Text style={SS.invoiceForLabel}>Account #: </Text>{st.accountNumber}</Text> : null}
        </View>
      </View>

      <View style={SS.activityHeaderRow}>
        <View style={SS.cellDate}><Text style={SS.activityHeaderText}>Date</Text></View>
        <View style={SS.cellDesc}><Text style={SS.activityHeaderText}>Description</Text></View>
        <View style={SS.cellQty}><Text style={SS.activityHeaderText}>Qty</Text></View>
        <View style={SS.cellPrice}><Text style={SS.activityHeaderText}>Price</Text></View>
        <View style={SS.cellTotal}><Text style={SS.activityHeaderText}>Total</Text></View>
      </View>

      {st?.priorInvoice && (
        <View style={SS.activityRow}>
          <View style={SS.cellDate}><Text style={SS.activityText}>{formatDate(st.priorInvoice.date)}</Text></View>
          <View style={SS.cellDesc}>
            <Text style={SS.activityText}>
              Invoice #{st.priorInvoice.invoiceNumber}{daysPastDueLabel(st.priorInvoice.daysPastDue)}
            </Text>
          </View>
          <View style={SS.cellQty} />
          <View style={SS.cellPrice} />
          <View style={SS.cellTotal}><Text style={SS.activityText}>{cents(st.priorInvoice.amountCents)}</Text></View>
        </View>
      )}
      {st?.lastPayment && (
        <View style={SS.activityRow}>
          <View style={SS.cellDate}><Text style={SS.activityText}>{formatDate(st.lastPayment.date)}</Text></View>
          <View style={SS.cellDesc}>
            <Text style={SS.activityText}>
              Last Payment Received{st.lastPayment.reference ? ` (Ref #: ${st.lastPayment.reference})` : ""}
            </Text>
          </View>
          <View style={SS.cellQty} />
          <View style={SS.cellPrice} />
          <View style={SS.cellTotal}><Text style={SS.activityText}>{cents(st.lastPayment.amountCents)}</Text></View>
        </View>
      )}

      {(st?.priorInvoice || st?.lastPayment) && (
        <View style={SS.activityDividerRow}>
          <Text style={SS.activityDividerText}>********* NEW ACCOUNT ACTIVITY *********</Text>
        </View>
      )}

      {invoice.lineItems.map((li, i) => (
        <View key={i} style={SS.activityRow}>
          <View style={SS.cellDate}><Text style={SS.activityText}>{formatDate(invoice.invoiceDate)}</Text></View>
          <View style={SS.cellDesc}>
            <Text style={SS.activityText}>{li.name ?? invoice.description ?? "Service"}</Text>
          </View>
          <View style={SS.cellQty}><Text style={SS.activityText}>{li.qty.toLocaleString()}</Text></View>
          <View style={SS.cellPrice}><Text style={SS.activityText}>{cents(li.rateCents)}</Text></View>
          <View style={SS.cellTotal}><Text style={SS.activityText}>{cents(li.totalCents)}</Text></View>
        </View>
      ))}

      <View style={SS.onlineBox}>
        <Text style={SS.onlineBoxLabel}>To View Your Invoice Online</Text>
        <Text style={SS.onlineBoxText}>
          {invoice.viewOnlineUrl
            ? `Go to ${invoice.viewOnlineUrl}`
            : "Log in to your client portal to view this invoice and payment history."}
        </Text>
      </View>

      {invoice.advertisementText ? (
        <View style={{ marginTop: 10 }}>
          <Text style={[SS.activityText, { fontSize: 7.5 }]}>{invoice.advertisementText?.replace(/<[^>]+>/g, "")}</Text>
        </View>
      ) : null}

      {invoice.notes ? (
        <View style={SS.termsSection}>
          <Text style={SS.termsText}>{invoice.notes?.replace(/<[^>]+>/g, "")}</Text>
        </View>
      ) : null}

      <View style={SS.stub}>
        <View style={SS.stubLeft}>
          <View style={SS.stubRow}><Text style={SS.stubLabel}>Client Name</Text><Text style={SS.stubValue}>{invoice.clientName ?? "—"}</Text></View>
          <View style={SS.stubRow}><Text style={SS.stubLabel}>Invoice #</Text><Text style={SS.stubValue}>{invoiceLabel}</Text></View>
          <View style={SS.stubRow}><Text style={SS.stubLabel}>Invoice Date</Text><Text style={SS.stubValue}>{formatDate(invoice.invoiceDate)}</Text></View>
          <View style={SS.stubRow}><Text style={SS.stubLabel}>Amount Due</Text><Text style={[SS.stubValue, { fontFamily: "Helvetica-Bold" }]}>{cents(showAccountBalance ? (st?.accountBalanceCents ?? invoice.totalCents) : invoice.balanceCents)}</Text></View>
        </View>
        <View style={SS.stubRight}>
          <Text style={SS.stubTitle}>PAYMENT STUB</Text>
          <Text style={[SS.companyMeta, { marginTop: 6 }]}>{org.name}</Text>
          <Text style={SS.companyMeta}>{org.street}</Text>
          {orgAddressLine2 ? <Text style={SS.companyMeta}>{orgAddressLine2}</Text> : null}
        </View>
      </View>

      <View style={SS.footer} fixed>
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
    case "statement":
      return <StatementInvoiceLayout invoice={invoice} org={org} />;
    case "statement_invoice_only":
      return <StatementInvoiceLayout invoice={invoice} org={org} showAccountBalance={false} />;
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
