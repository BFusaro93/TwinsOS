import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ChemicalNoticeData, ChemicalNoticeOrg } from "@/lib/chemical/application-notice";
import { chemicalConditionsText, chemicalNoticeDateText } from "@/lib/chemical/application-notice";

/**
 * The emailed PDF copy of the Notice of Treatment — one roomy portrait page,
 * laid out like the invoice's "Chemical Application Record" and branded from the
 * same template (logo + accent colour). The compact HTML version rides in the
 * email body; this is the attachment the client can keep or print.
 */

const COL = { product: "21%", targets: "13%", areas: "13%", ratio: "15%", amount: "14%", method: "13%", reEntry: "11%" } as const;

function formatTime(iso: string | null, timeZone?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

export function ChemicalNoticeDocument({
  data,
  org,
  timeZone,
}: {
  data: ChemicalNoticeData;
  org: ChemicalNoticeOrg;
  timeZone?: string;
}) {
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(org.brandColor ?? "") ? (org.brandColor as string) : "#0f172a";
  const tint = /^#[0-9a-fA-F]{6}$/.test(accent) ? `${accent}1f` : "#f1f5f9";
  const S = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b", paddingTop: 44, paddingBottom: 64, paddingHorizontal: 48, backgroundColor: "#ffffff" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 3, borderBottomColor: accent, paddingBottom: 12, marginBottom: 20 },
    logo: { maxHeight: 54, maxWidth: 190, objectFit: "contain" },
    orgName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: accent },
    orgRight: { alignItems: "flex-end", fontSize: 9, color: "#475569", lineHeight: 1.5 },
    orgRightName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
    title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: accent, marginBottom: 4 },
    sub: { fontSize: 10, color: "#64748b", marginBottom: 18 },
    metaRow: { flexDirection: "row", marginBottom: 20 },
    metaItem: { marginRight: 26 },
    metaLabel: { fontSize: 9, color: "#64748b", marginBottom: 2 },
    metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
    headRow: { flexDirection: "row", backgroundColor: tint, borderBottomWidth: 2, borderBottomColor: accent, paddingVertical: 8, paddingHorizontal: 6 },
    headCell: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#0f172a", paddingRight: 4 },
    row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: "#e2e8f0", paddingVertical: 10, paddingHorizontal: 6 },
    cell: { fontSize: 10, paddingRight: 4 },
    epa: { fontSize: 8.5, color: "#64748b", marginTop: 2 },
    sectionHead: { fontSize: 11, fontFamily: "Helvetica-Bold", color: accent, marginTop: 22, marginBottom: 6 },
    body: { fontSize: 10, lineHeight: 1.5, marginBottom: 8 },
    footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between" },
    footerText: { fontSize: 8, color: "#94a3b8" },
  });

  const applied = data.products.filter((p) => p.used);
  const conditions = chemicalConditionsText(data);
  const timeRange = [formatTime(data.startTime, timeZone), formatTime(data.endTime, timeZone)].filter(Boolean).join(" – ");
  const applicator = [data.applicatorName, data.applicatorLicense ? `Lic. ${data.applicatorLicense}` : ""].filter(Boolean).join(" · ");
  const seen = new Set<string>();
  const instructions = applied.filter((p) => p.careInstructions && !seen.has(p.careInstructions) && seen.add(p.careInstructions));
  const addressLines = org.addressLines ?? [];

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <View style={S.header}>
          {org.logoUrl ? <Image src={org.logoUrl} style={S.logo} /> : <Text style={S.orgName}>{org.name}</Text>}
          <View style={S.orgRight}>
            {org.logoUrl ? <Text style={S.orgRightName}>{org.name}</Text> : null}
            {addressLines.map((l, i) => <Text key={i}>{l}</Text>)}
            {org.phone ? <Text>{org.phone}</Text> : null}
            {org.website ? <Text>{org.website}</Text> : null}
          </View>
        </View>

        <Text style={S.title}>Chemical Application Notice</Text>
        <Text style={S.sub}>
          {data.clientName}
          {data.addressLine ? ` · ${data.addressLine}` : ""}
          {data.serviceName ? ` · ${data.serviceName}` : ""}
        </Text>

        <View style={S.metaRow}>
          <View style={S.metaItem}><Text style={S.metaLabel}>Date</Text><Text style={S.metaValue}>{chemicalNoticeDateText(data, timeZone) || "—"}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>Time</Text><Text style={S.metaValue}>{timeRange || "—"}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>Weather</Text><Text style={S.metaValue}>{conditions || "—"}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>Applicator</Text><Text style={S.metaValue}>{applicator || "—"}</Text></View>
        </View>

        <View style={S.headRow}>
          <Text style={[S.headCell, { width: COL.product }]}>Product &amp; EPA #</Text>
          <Text style={[S.headCell, { width: COL.targets }]}>Targets</Text>
          <Text style={[S.headCell, { width: COL.areas }]}>Areas Treated</Text>
          <Text style={[S.headCell, { width: COL.ratio }]}>Ratio</Text>
          <Text style={[S.headCell, { width: COL.amount }]}>Amount Applied</Text>
          <Text style={[S.headCell, { width: COL.method }]}>Method</Text>
          <Text style={[S.headCell, { width: COL.reEntry }]}>Re-Entry</Text>
        </View>
        {applied.length === 0 ? (
          <View style={S.row}><Text style={S.cell}>No products recorded.</Text></View>
        ) : (
          applied.map((p, i) => (
            <View key={i} style={S.row} wrap={false}>
              <View style={{ width: COL.product, paddingRight: 4 }}>
                <Text style={S.cell}>{p.name}</Text>
                {p.epaNumber ? <Text style={S.epa}>EPA {p.epaNumber}</Text> : null}
              </View>
              <Text style={[S.cell, { width: COL.targets }]}>{p.targets ?? "—"}</Text>
              <Text style={[S.cell, { width: COL.areas }]}>{p.areasTreated ?? "—"}</Text>
              <Text style={[S.cell, { width: COL.ratio }]}>{p.rate ?? "—"}</Text>
              <Text style={[S.cell, { width: COL.amount }]}>{p.amount ?? "—"}</Text>
              <Text style={[S.cell, { width: COL.method }]}>{p.method ?? "—"}</Text>
              <Text style={[S.cell, { width: COL.reEntry }]}>{p.reEntryInterval ?? "—"}</Text>
            </View>
          ))
        )}

        {instructions.length > 0 ? (
          <View wrap={false}>
            <Text style={S.sectionHead}>Instructions</Text>
            {instructions.map((p, i) => (
              <Text key={i} style={S.body}>
                {applied.length > 1 ? `${p.name}: ` : ""}
                {p.careInstructions}
              </Text>
            ))}
          </View>
        ) : null}

        {org.showTechNotes && data.techNotes ? (
          <View wrap={false}>
            <Text style={S.sectionHead}>Technician notes</Text>
            <Text style={S.body}>{data.techNotes}</Text>
          </View>
        ) : null}

        <View style={S.footer} fixed>
          <Text style={S.footerText}>{org.name}{org.phone ? ` · ${org.phone}` : ""}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
