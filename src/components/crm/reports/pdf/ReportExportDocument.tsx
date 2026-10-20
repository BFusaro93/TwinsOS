import { Document, Font, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

export interface ReportExportGrouped {
  grandTotal: string[];
  groups: { label: string; subtotal: string[]; rows: string[][] }[];
}

export interface ReportExportSection {
  heading: string;
  columns: string[];
  rows: string[][];
  /** Flat sections only — a formatted totals row (same cells the on-screen
   *  table footer shows) rendered bold after the last data row. Ignored
   *  when `grouped` is set, which carries its own grand-total row. */
  totals?: string[];
  grouped?: ReportExportGrouped;
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

// react-pdf hyphenates by default ("Shrews-bury", "Chem-ical"), which chops
// names, EPA numbers and licence numbers in narrow columns. Whole words only.
Font.registerHyphenationCallback((word) => [word]);

/** More columns than this and equal-width cells stop working (headers collide,
 *  long tokens such as licence numbers overflow into the next column). */
const WIDE_TABLE_COLUMNS = 10;
const PAGE_TEXT_WIDTH = 792 - 2 * 28;
const CELL_PADDING = 4;

interface ColumnLayout {
  /** flex-grow weights, proportional to each column's content. */
  weights: number[];
  fontSize: number;
}

/**
 * Sizes the columns of a wide table from its content: each column's weight
 * follows its longest unbreakable token and (capped) text length, and the font
 * shrinks until the longest tokens fit their columns. Narrow tables keep the
 * original equal-width layout so existing reports print exactly as before.
 */
function layoutColumns(columns: string[], bodyRows: string[][]): ColumnLayout | null {
  if (columns.length <= WIDE_TABLE_COLUMNS) return null;
  const tokenMax = columns.map((c) => Math.max(1, ...c.split(/\s+/).map((w) => w.length)));
  const textMax = columns.map(() => 0);
  bodyRows.forEach((row) =>
    row.forEach((cell, ci) => {
      if (ci >= columns.length) return;
      const text = String(cell ?? "");
      textMax[ci] = Math.max(textMax[ci], Math.min(text.length, 26));
      tokenMax[ci] = Math.max(tokenMax[ci], ...text.split(/\s+/).map((w) => w.length));
    })
  );
  const weights = columns.map((_, ci) => Math.max(tokenMax[ci], textMax[ci] * 0.6, 4));
  const available = PAGE_TEXT_WIDTH - columns.length * CELL_PADDING * 2;
  const needed = tokenMax.reduce((sum, t) => sum + t, 0) * 0.56;
  const fontSize = Math.min(8, Math.max(5.5, Math.floor((8 * available) / needed * 2) / 2));
  return { weights, fontSize };
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
  grandTotalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e2e8f0", backgroundColor: "#cbd5e1" },
  subtotalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e2e8f0", backgroundColor: "#e2e8f0" },
  cellBold: { flex: 1, padding: 4, fontWeight: 700, color: "#1e293b" },
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
      <Page size="LETTER" orientation={sections.some((s) => s.columns.length > 6) ? "landscape" : "portrait"} style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
        {charts && charts.length > 0 && (
          <View style={styles.chartsRow}>
            {charts.map((chart, ci) => (
              <ExportBarChart key={ci} chart={chart} color={CHART_COLORS[ci % CHART_COLORS.length]} />
            ))}
          </View>
        )}
        {sections.map((section, si) => {
          const bodyRows = section.grouped
            ? [section.grouped.grandTotal, ...section.grouped.groups.flatMap((g) => [g.subtotal, ...g.rows])]
            : [...section.rows, ...(section.totals ? [section.totals] : [])];
          const layout = layoutColumns(section.columns, bodyRows);
          const cellStyle = (base: Style, ci: number): Style | Style[] =>
            layout ? [base, { flex: layout.weights[ci] ?? 1, fontSize: layout.fontSize }] : base;
          return (
          // wrap defaults to true here (unlike a table row) so a section with
          // more rows than fit on one page continues onto the next instead of
          // being silently cut off — only individual rows must stay intact.
          <View key={si}>
            {section.heading && <Text style={styles.sectionHeading}>{section.heading}</Text>}
            <View style={styles.table}>
              <View style={styles.headerRow}>
                {section.columns.map((col, ci) => (
                  <Text key={ci} style={cellStyle(styles.cellHeader, ci)}>{col}</Text>
                ))}
              </View>
              {section.grouped ? (
                <>
                  <View style={styles.grandTotalRow} wrap={false}>
                    {section.grouped.grandTotal.map((cell, ci) => (
                      <Text key={ci} style={cellStyle(styles.cellBold, ci)}>{cell}</Text>
                    ))}
                  </View>
                  {section.grouped.groups.map((group, gi) => (
                    <View key={gi}>
                      <View style={styles.subtotalRow} wrap={false}>
                        {group.subtotal.map((cell, ci) => (
                          <Text key={ci} style={cellStyle(styles.cellBold, ci)}>{cell}</Text>
                        ))}
                      </View>
                      {group.rows.map((row, ri) => (
                        <View key={ri} style={styles.row} wrap={false}>
                          {row.map((cell, ci) => (
                            <Text key={ci} style={cellStyle(styles.cell, ci)}>{cell}</Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  ))}
                  {section.grouped.groups.length === 0 && (
                    <View style={styles.row}>
                      <Text style={styles.cell}>No rows.</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {section.rows.map((row, ri) => (
                    <View key={ri} style={styles.row} wrap={false}>
                      {row.map((cell, ci) => (
                        <Text key={ci} style={cellStyle(styles.cell, ci)}>{cell}</Text>
                      ))}
                    </View>
                  ))}
                  {section.rows.length === 0 && (
                    <View style={styles.row}>
                      <Text style={styles.cell}>No rows.</Text>
                    </View>
                  )}
                  {section.totals && section.rows.length > 0 && (
                    <View style={styles.grandTotalRow} wrap={false}>
                      {section.totals.map((cell, ci) => (
                        <Text key={ci} style={cellStyle(styles.cellBold, ci)}>{cell}</Text>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
          );
        })}
      </Page>
    </Document>
  );
}
