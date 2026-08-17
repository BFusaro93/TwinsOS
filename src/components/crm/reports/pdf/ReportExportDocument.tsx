import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

export interface ReportExportSection {
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface ReportExportData {
  title: string;
  generatedAt: string;
  sections: ReportExportSection[];
}

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
});

export function ReportExportDocument({ title, generatedAt, sections }: ReportExportData) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
        {sections.map((section, si) => (
          <View key={si} wrap={false}>
            {section.heading && <Text style={styles.sectionHeading}>{section.heading}</Text>}
            <View style={styles.table}>
              <View style={styles.headerRow}>
                {section.columns.map((col, ci) => (
                  <Text key={ci} style={styles.cellHeader}>{col}</Text>
                ))}
              </View>
              {section.rows.map((row, ri) => (
                <View key={ri} style={styles.row}>
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
