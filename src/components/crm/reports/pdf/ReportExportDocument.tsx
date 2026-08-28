import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

export interface ReportExportSection {
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface ReportExportChart {
  title: string;
  bars: { label: string; value: number; valueLabel: string }[];
}

export interface ReportExportData {
  title: string;
  generatedAt: string;
  sections: ReportExportSection[];
  charts?: ReportExportChart[];
}

const CHART_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7"];
const CHART_BAR_TRACK_WIDTH = 260;

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  generatedAt: { fontSize: 8, color: "#64748b", marginBottom: 14 },
  sectionHeading: { fontSize: 11, fontWeight: 700, marginTop: 14, marginBottom: 6, color: "#1e293b" },
  table: { display: "flex", width: "100%", borderWidth: 1, borderColor: "#e2e8f0" },
  headerRow: { flexDirection: "row", backgroundColor: "#f1f5f9" },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  cellHeader: { flex: 1, padding: 4, fontWeight: 700, color: "#334155" },
  cell: { flex: 1, padding: 4, color: "#334155" },
  chartsRow: { flexDirection: "row", gap: 24, marginBottom: 4 },
  chart: { flex: 1 },
  chartTitle: { fontSize: 10, fontWeight: 700, marginBottom: 6, color: "#1e293b" },
  chartBarRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  chartLabel: { width: 90, fontSize: 7, color: "#334155" },
  chartBarTrack: { width: CHART_BAR_TRACK_WIDTH, backgroundColor: "#f1f5f9", height: 10 },
  chartBar: { height: 10 },
  chartValue: { width: 46, fontSize: 7, textAlign: "right", marginLeft: 4, color: "#334155" },
});

function ExportBarChart({ chart, color }: { chart: ReportExportChart; color: string }) {
  const maxValue = Math.max(1, ...chart.bars.map((b) => Math.abs(b.value)));
  return (
    <View style={styles.chart}>
      <Text style={styles.chartTitle}>{chart.title}</Text>
      {chart.bars.map((bar, bi) => {
        const width = Math.max(2, (Math.abs(bar.value) / maxValue) * CHART_BAR_TRACK_WIDTH);
        return (
          <View key={bi} style={styles.chartBarRow} wrap={false}>
            <Text style={styles.chartLabel}>{bar.label}</Text>
            <View style={styles.chartBarTrack}>
              <View style={[styles.chartBar, { width, backgroundColor: color }]} />
            </View>
            <Text style={styles.chartValue}>{bar.valueLabel}</Text>
          </View>
        );
      })}
      {chart.bars.length === 0 && <Text style={styles.chartLabel}>No data.</Text>}
    </View>
  );
}

export function ReportExportDocument({ title, generatedAt, sections, charts }: ReportExportData) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
        {charts && charts.length > 0 && (
          <View style={styles.chartsRow}>
            {charts.map((chart, ci) => (
              <ExportBarChart key={ci} chart={chart} color={CHART_COLORS[ci % CHART_COLORS.length]} />
            ))}
          </View>
        )}
        {sections.map((section, si) => (
          // wrap defaults to true here (unlike a table row) so a section with
          // more rows than fit on one page continues onto the next instead of
          // being silently cut off — only individual rows must stay intact.
          <View key={si}>
            {section.heading && <Text style={styles.sectionHeading}>{section.heading}</Text>}
            <View style={styles.table}>
              <View style={styles.headerRow}>
                {section.columns.map((col, ci) => (
                  <Text key={ci} style={styles.cellHeader}>{col}</Text>
                ))}
              </View>
              {section.rows.map((row, ri) => (
                <View key={ri} style={styles.row} wrap={false}>
                  {row.map((cell, ci) => (
                    <Text key={ci} style={styles.cell}>{cell}</Text>
                  ))}
                </View>
              ))}
              {section.rows.length === 0 && (
                <View style={styles.row}>
                  <Text style={styles.cell}>No rows.</Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
