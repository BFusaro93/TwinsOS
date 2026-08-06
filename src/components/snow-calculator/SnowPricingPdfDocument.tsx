import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

export interface SnowPricingPdfRow {
  label: string;
  detail?: string;
  amount: number;
}

export interface SnowPricingPdfSection {
  title: string;
  subtotal: number;
  rows: SnowPricingPdfRow[];
}

export interface SnowPricingPdfData {
  orgName: string;
  generatedOn: string;
  sections: SnowPricingPdfSection[];
  subtotal: number;
  markupPct: number;
  totalWithMarkup: number;
  perInchCost: number;
  perStorm: { label: string; amount: number }[];
}

function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ACCENT = "#0369a1";

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    backgroundColor: "#ffffff",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  orgName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  genDate: { fontSize: 8, color: "#64748b", marginTop: 2 },
  titleBand: {
    backgroundColor: ACCENT,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  titleText: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 0.5 },

  sectionBlock: { marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 2,
  },
  sectionHeaderText: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4, borderBottom: "1 solid #f1f5f9" },
  rowLabel: { fontSize: 8.5, color: "#334155" },
  rowDetail: { fontSize: 7.5, color: "#94a3b8", marginTop: 1 },
  rowAmount: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#334155" },

  totalsBlock: { marginTop: 18, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 240, justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 9, color: "#475569" },
  totalsValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  totalDivider: { width: 240, borderTop: "1 solid #e2e8f0", marginVertical: 4 },
  grandTotalRow: { flexDirection: "row", width: 240, justifyContent: "space-between", paddingVertical: 4 },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT },

  perStormSection: { marginTop: 22 },
  perStormTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  perStormRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "1 solid #f1f5f9" },
  perStormLabel: { fontSize: 9, color: "#334155" },
  perStormValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  footer: { position: "absolute", bottom: 24, left: 40, right: 40, borderTop: "1 solid #e2e8f0", paddingTop: 8 },
  footerText: { fontSize: 7, color: "#94a3b8" },
});

export function SnowPricingPdfDocument({ data }: { data: SnowPricingPdfData }) {
  return (
    <Document title="Snow Pricing Calculator">
      <Page size="LETTER" style={S.page}>
        <View style={S.header}>
          <Text style={S.orgName}>{data.orgName}</Text>
          <Text style={S.genDate}>Generated {data.generatedOn}</Text>
        </View>

        <View style={S.titleBand}>
          <Text style={S.titleText}>SNOW PRICING CALCULATOR</Text>
        </View>

        {data.sections.map((section) => (
          <View key={section.title} style={S.sectionBlock} wrap={false}>
            <View style={S.sectionHeaderRow}>
              <Text style={S.sectionHeaderText}>{section.title}</Text>
              <Text style={S.sectionHeaderText}>{money(section.subtotal)}</Text>
            </View>
            {section.rows.map((row, i) => (
              <View key={i} style={S.row}>
                <View>
                  <Text style={S.rowLabel}>{row.label}</Text>
                  {row.detail ? <Text style={S.rowDetail}>{row.detail}</Text> : null}
                </View>
                <Text style={S.rowAmount}>{money(row.amount)}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={S.totalsBlock}>
          <View style={S.totalsRow}>
            <Text style={S.totalsLabel}>Sub-Total</Text>
            <Text style={S.totalsValue}>{money(data.subtotal)}</Text>
          </View>
          <View style={S.totalsRow}>
            <Text style={S.totalsLabel}>Markup ({data.markupPct}%)</Text>
            <Text style={S.totalsValue}>{money(data.totalWithMarkup - data.subtotal)}</Text>
          </View>
          <View style={S.totalDivider} />
          <View style={S.grandTotalRow}>
            <Text style={S.grandTotalLabel}>Season Total</Text>
            <Text style={S.grandTotalValue}>{money(data.totalWithMarkup)}</Text>
          </View>
          <View style={S.totalsRow}>
            <Text style={S.totalsLabel}>Per Inch (÷60)</Text>
            <Text style={S.totalsValue}>{money(data.perInchCost)}</Text>
          </View>
        </View>

        <View style={S.perStormSection} wrap={false}>
          <Text style={S.perStormTitle}>Per-Storm Pricing</Text>
          {data.perStorm.map((r) => (
            <View key={r.label} style={S.perStormRow}>
              <Text style={S.perStormLabel}>{r.label}</Text>
              <Text style={S.perStormValue}>{money(r.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${data.orgName} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
