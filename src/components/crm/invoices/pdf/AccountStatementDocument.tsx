import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { OrgPDFData } from "./InvoiceDocument";

// ── types ────────────────────────────────────────────────────────────────────

export interface AccountStatementActivityRow {
  date: string;
  kind: "invoice" | "payment" | "credit";
  label: string;
  invoiceNumber: number | null;
  /** Signed: positive for an invoice (charge), negative for a payment/credit. */
  amountCents: number;
  /** Running account balance immediately after this transaction. */
  balanceCents: number;
}

export interface AccountStatementPDFData {
  statementDate: string;
  periodFrom: string;
  periodTo: string;
  accountNumber: string | null;
  clientName: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientState: string | null;
  clientZip: string | null;
  message: string | null;
  balanceForwardCents: number;
  rows: AccountStatementActivityRow[];
  endingBalanceCents: number;
  lastPayment: { amountCents: number; date: string; reference: string | null } | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function cents(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + (Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

// ── styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.5, color: "#1e293b", padding: 32, paddingBottom: 90, backgroundColor: "#ffffff" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  fromBlock: { flexDirection: "column" },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  companyMeta: { fontSize: 7.5, color: "#4b5563", lineHeight: 1.4 },
  logo: { width: 110, height: 44, objectFit: "contain", objectPositionX: "right" },
  titleBlock: { alignItems: "flex-end" },
  titleText: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  statementDate: { fontSize: 7.5, color: "#4b5563", marginTop: 2 },

  messageBox: { marginBottom: 14, padding: 8, borderRadius: 2, backgroundColor: "#f8fafc", border: "1 solid #e2e8f0" },
  messageText: { fontSize: 7.5, color: "#475569", lineHeight: 1.5 },

  addressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  toBlock: { flexDirection: "column", maxWidth: 260 },
  toLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  toName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  toLine: { fontSize: 8, color: "#374151" },

  metaTable: { width: 220, borderTop: "1 solid #cbd5e1", borderLeft: "1 solid #cbd5e1", borderRight: "1 solid #cbd5e1" },
  metaRow: { flexDirection: "row", borderBottom: "1 solid #cbd5e1" },
  metaCellLabel: { flex: 1.4, backgroundColor: "#f0fdf4", padding: 4, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#166534" },
  metaCellValue: { flex: 1, padding: 4, fontSize: 7.5, textAlign: "right" },

  activityHeaderRow: { flexDirection: "row", backgroundColor: "#166534", paddingVertical: 5, paddingHorizontal: 6, marginTop: 6 },
  activityHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase" },
  activityRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottom: "1 solid #f1f5f9" },
  forwardRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottom: "1 solid #f1f5f9", backgroundColor: "#f8fafc" },
  cellDate: { flex: 1 },
  cellDesc: { flex: 3.5 },
  cellAmount: { flex: 1, textAlign: "right" },
  cellBalance: { flex: 1, textAlign: "right" },
  activityText: { fontSize: 7.5, color: "#334155" },
  activityTextBold: { fontSize: 7.5, color: "#1e293b", fontFamily: "Helvetica-Bold" },

  endingRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, marginTop: 2, backgroundColor: "#166534" },
  endingLabel: { flex: 4.5, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  endingValue: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#ffffff", textAlign: "right" },

  stub: { position: "absolute", bottom: 30, left: 32, right: 32, borderTop: "2 solid #166534", paddingTop: 10, flexDirection: "row", justifyContent: "space-between" },
  stubLeft: { flexDirection: "column" },
  stubRow: { flexDirection: "row", marginBottom: 2 },
  stubLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", width: 90 },
  stubValue: { fontSize: 7.5 },
  stubTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#166534" },
  stubRight: { flexDirection: "column", alignItems: "flex-end" },

  footer: { position: "absolute", bottom: 14, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: "#9ca3af" },
});

function kindLabel(kind: AccountStatementActivityRow["kind"]): string {
  if (kind === "invoice") return "Charge";
  if (kind === "credit") return "Credit";
  return "Payment";
}

export function AccountStatementDocument({
  statement,
  org,
}: {
  statement: AccountStatementPDFData;
  org: OrgPDFData;
}) {
  const clientAddressLine2 = [statement.clientCity, statement.clientState, statement.clientZip]
    .filter(Boolean)
    .join(", ");
  const orgAddressLine2 = [org.city, org.state, org.zip].filter(Boolean).join(", ");

  return (
    <Document title={`Statement — ${statement.clientName ?? "Client"}`} author={org.name}>
      <Page size="LETTER" style={S.page}>
        <View style={S.header}>
          <View style={S.fromBlock}>
            <Text style={S.companyName}>{org.name}</Text>
            <Text style={S.companyMeta}>{org.street}</Text>
            {orgAddressLine2 ? <Text style={S.companyMeta}>{orgAddressLine2}</Text> : null}
            {org.phone ? <Text style={S.companyMeta}>{org.phone}</Text> : null}
          </View>
          <View style={S.titleBlock}>
            {org.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={org.logoUrl} style={S.logo} />
            ) : (
              <Text style={S.titleText}>STATEMENT</Text>
            )}
            <Text style={S.statementDate}>Statement Date: {formatDate(statement.statementDate)}</Text>
            <Text style={S.statementDate}>
              Period: {formatDate(statement.periodFrom)} – {formatDate(statement.periodTo)}
            </Text>
          </View>
        </View>

        {statement.message ? (
          <View style={S.messageBox}>
            <Text style={S.messageText}>{statement.message}</Text>
          </View>
        ) : null}

        <View style={S.addressRow}>
          <View style={S.toBlock}>
            <Text style={S.toLabel}>To</Text>
            <Text style={S.toName}>{statement.clientName ?? "—"}</Text>
            {statement.clientAddress ? <Text style={S.toLine}>{statement.clientAddress}</Text> : null}
            {clientAddressLine2 ? <Text style={S.toLine}>{clientAddressLine2}</Text> : null}
          </View>
          <View style={S.metaTable}>
            {statement.accountNumber ? (
              <View style={S.metaRow}>
                <View style={S.metaCellLabel}><Text>Account #</Text></View>
                <View style={S.metaCellValue}><Text>{statement.accountNumber}</Text></View>
              </View>
            ) : null}
            {statement.lastPayment ? (
              <View style={S.metaRow}>
                <View style={S.metaCellLabel}><Text>Last Payment Received</Text></View>
                <View style={S.metaCellValue}><Text>{cents(statement.lastPayment.amountCents)}</Text></View>
              </View>
            ) : null}
            <View style={[S.metaRow, { borderBottom: "none" }]}>
              <View style={S.metaCellLabel}><Text>Amount Due</Text></View>
              <View style={S.metaCellValue}><Text>{cents(statement.endingBalanceCents)}</Text></View>
            </View>
          </View>
        </View>

        <View style={S.activityHeaderRow}>
          <View style={S.cellDate}><Text style={S.activityHeaderText}>Date</Text></View>
          <View style={S.cellDesc}><Text style={S.activityHeaderText}>Transaction</Text></View>
          <View style={S.cellAmount}><Text style={S.activityHeaderText}>Amount</Text></View>
          <View style={S.cellBalance}><Text style={S.activityHeaderText}>Balance</Text></View>
        </View>

        <View style={S.forwardRow}>
          <View style={S.cellDate}><Text style={S.activityTextBold}>{formatDate(statement.periodFrom)}</Text></View>
          <View style={S.cellDesc}><Text style={S.activityTextBold}>Balance Forward</Text></View>
          <View style={S.cellAmount} />
          <View style={S.cellBalance}><Text style={S.activityTextBold}>{cents(statement.balanceForwardCents)}</Text></View>
        </View>

        {statement.rows.map((r, i) => (
          <View key={i} style={S.activityRow}>
            <View style={S.cellDate}><Text style={S.activityText}>{formatDate(r.date)}</Text></View>
            <View style={S.cellDesc}><Text style={S.activityText}>{kindLabel(r.kind)} — {r.label}</Text></View>
            <View style={S.cellAmount}><Text style={S.activityText}>{cents(r.amountCents)}</Text></View>
            <View style={S.cellBalance}><Text style={S.activityText}>{cents(r.balanceCents)}</Text></View>
          </View>
        ))}

        <View style={S.endingRow}>
          <Text style={S.endingLabel}>Ending Balance</Text>
          <Text style={S.endingValue}>{cents(statement.endingBalanceCents)}</Text>
        </View>

        <View fixed style={S.stub}>
          <View style={S.stubLeft}>
            <View style={S.stubRow}><Text style={S.stubLabel}>Client Name</Text><Text style={S.stubValue}>{statement.clientName ?? "—"}</Text></View>
            {statement.accountNumber ? (
              <View style={S.stubRow}><Text style={S.stubLabel}>Account #</Text><Text style={S.stubValue}>{statement.accountNumber}</Text></View>
            ) : null}
            <View style={S.stubRow}><Text style={S.stubLabel}>Statement Date</Text><Text style={S.stubValue}>{formatDate(statement.statementDate)}</Text></View>
            <View style={S.stubRow}><Text style={S.stubLabel}>Amount Due</Text><Text style={[S.stubValue, { fontFamily: "Helvetica-Bold" }]}>{cents(statement.endingBalanceCents)}</Text></View>
          </View>
          <View style={S.stubRight}>
            <Text style={S.stubTitle}>PAYMENT STUB</Text>
            <Text style={[S.companyMeta, { marginTop: 6 }]}>{org.name}</Text>
            <Text style={S.companyMeta}>{org.street}</Text>
            {orgAddressLine2 ? <Text style={S.companyMeta}>{orgAddressLine2}</Text> : null}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text>{org.name} · {org.phone}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
