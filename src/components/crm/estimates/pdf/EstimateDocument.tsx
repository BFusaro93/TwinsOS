import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { BILLING_TERMS_OPTIONS } from "@/lib/constants";
import { computeInstallmentSchedule } from "@/lib/estimate-calc";

// ── types ────────────────────────────────────────────────────────────────────

export interface EstimatePDFLineItem {
  serviceName: string | null;
  estimateDesc: string | null;
  qty: number;
  unitType: string | null;
  rateCents: number;
  visits: number;
  totalCents: number;
  tier: "basic" | "standard" | "premium" | null;
}

export interface EstimatePDFMilestone {
  name: string;
  amountCents: number;
}

export interface EstimatePDFData {
  estimateNumber: number;
  description: string | null;
  createdAt: string;
  validUntil: string | null;
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
  showDiscounts: boolean;
  totalCents: number;
  paymentTerms: string | null;
  depositRequiredCents: number;
  numInstallments: number;
  installmentDayOfMonth: number | null;
  paymentPlanType: "installments" | "milestones";
  milestones: EstimatePDFMilestone[];
  tiersEnabled: boolean;
  tierLabels: { basic: string; standard: string; premium: string };

  lineItems: EstimatePDFLineItem[];
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
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const TIER_ORDER = ["basic", "standard", "premium"] as const;

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

  // header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  logo: { width: 120, height: 48, objectFit: "contain", objectPositionX: "left" },
  logoPlaceholder: { width: 120 },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyMeta: { fontSize: 8, color: "#64748b", lineHeight: 1.5 },

  // title band
  titleBand: { borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleText: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 1 },
  estimateNumBlock: { alignItems: "flex-end" },
  estimateNumLabel: { fontSize: 7, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5, textTransform: "uppercase" },
  estimateNumValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },

  // address row
  addressRow: { flexDirection: "row", marginBottom: 20, gap: 16 },
  addressBlock: { flex: 1 },
  addressLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  addressName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  addressLine: { fontSize: 8.5, color: "#475569", lineHeight: 1.5 },

  // meta row
  metaRow: { flexDirection: "row", gap: 16, marginBottom: 20 },
  metaCell: { flex: 1, borderTop: "1 solid #e2e8f0", paddingTop: 6 },
  metaLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  // line items table
  tableHeader: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderRadius: 2 },
  tierGroup: { marginBottom: 18 },
  tierBanner: { paddingHorizontal: 8, paddingVertical: 5, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  tierBannerText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.5 },
  tierSubtotalRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#f8fafc" },
  tierSubtotalLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#475569" },
  tierSubtotalValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  tableHeaderText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.3 },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottom: "1 solid #f1f5f9" },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  cellService: { flex: 3 },
  cellNum: { flex: 1, textAlign: "right" },
  cellTotal: { flex: 1.2, textAlign: "right" },
  serviceNameText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  serviceDescText: { fontSize: 7.5, color: "#64748b", marginTop: 2, lineHeight: 1.4 },
  cellText: { fontSize: 9, color: "#334155" },

  // totals
  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 8.5, color: "#475569" },
  totalsValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  totalDivider: { width: 220, borderTop: "1 solid #e2e8f0", marginVertical: 4 },
  grandTotalRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 4 },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },

  // notes
  notesSection: { marginTop: 24, borderTop: "1 solid #e2e8f0", paddingTop: 12 },
  scheduleSection: { marginTop: 16 },
  scheduleLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
  scheduleRow: { flexDirection: "row", justifyContent: "space-between", width: 260, paddingVertical: 2 },
  scheduleText: { fontSize: 8.5, color: "#475569" },
  notesLabel: { fontSize: 7, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  notesText: { fontSize: 8.5, color: "#475569", lineHeight: 1.6 },

  // signature
  signatureSection: { marginTop: 28 },
  signatureRow: { flexDirection: "row", gap: 32 },
  signatureBlock: { flex: 1 },
  signatureLine: { borderTop: "1 solid #94a3b8", marginBottom: 4 },
  signatureLabel: { fontSize: 7.5, color: "#94a3b8" },

  // footer
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #e2e8f0", paddingTop: 8 },
  footerText: { fontSize: 7, color: "#94a3b8" },
});

// ── component ─────────────────────────────────────────────────────────────────

export function EstimateDocument({ estimate, org }: { estimate: EstimatePDFData; org: OrgPDFData }) {
  const accentColor = org.brandColor || "#60ab45";

  const clientAddressLine2 = [estimate.clientCity, estimate.clientState, estimate.clientZip]
    .filter(Boolean)
    .join(", ");

  const orgAddressLine2 = [org.city, org.state, org.zip].filter(Boolean).join(", ");

  const installmentSchedule = estimate.paymentPlanType === "installments"
    ? computeInstallmentSchedule(
        estimate.totalCents,
        estimate.depositRequiredCents,
        estimate.numInstallments,
        estimate.createdAt.slice(0, 10),
        estimate.installmentDayOfMonth
      )
    : [];

  return (
    <Document title={`Estimate #${estimate.estimateNumber}`} author={org.name}>
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
            {org.logoUrl && (
              <Text style={S.companyName}>{org.name}</Text>
            )}
            <Text style={S.companyMeta}>{org.street}</Text>
            {orgAddressLine2 ? <Text style={S.companyMeta}>{orgAddressLine2}</Text> : null}
            {org.phone ? <Text style={S.companyMeta}>{org.phone}</Text> : null}
          </View>
        </View>

        {/* ── title band ─────────────────────────────────────────────── */}
        <View style={[S.titleBand, { backgroundColor: accentColor }]}>
          <Text style={S.titleText}>ESTIMATE</Text>
          <View style={S.estimateNumBlock}>
            <Text style={S.estimateNumLabel}>Estimate No.</Text>
            <Text style={S.estimateNumValue}>#{String(estimate.estimateNumber).padStart(5, "0")}</Text>
          </View>
        </View>

        {/* ── address row ────────────────────────────────────────────── */}
        <View style={S.addressRow}>
          <View style={S.addressBlock}>
            <Text style={S.addressLabel}>Prepared For</Text>
            <Text style={S.addressName}>{estimate.clientName ?? "—"}</Text>
            {estimate.clientAddress ? <Text style={S.addressLine}>{estimate.clientAddress}</Text> : null}
            {clientAddressLine2 ? <Text style={S.addressLine}>{clientAddressLine2}</Text> : null}
          </View>
          <View style={S.addressBlock}>
            {estimate.description ? (
              <>
                <Text style={S.addressLabel}>Description</Text>
                <Text style={[S.addressLine, { color: "#1e293b" }]}>{estimate.description}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* ── meta row ───────────────────────────────────────────────── */}
        <View style={S.metaRow}>
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Estimate Date</Text>
            <Text style={S.metaValue}>{formatDate(estimate.createdAt)}</Text>
          </View>
          {estimate.validUntil ? (
            <View style={S.metaCell}>
              <Text style={S.metaLabel}>Valid Until</Text>
              <Text style={S.metaValue}>{formatDate(estimate.validUntil)}</Text>
            </View>
          ) : <View style={S.metaCell} />}
          {estimate.paymentTerms ? (
            <View style={S.metaCell}>
              <Text style={S.metaLabel}>Payment Terms</Text>
              <Text style={S.metaValue}>
                {BILLING_TERMS_OPTIONS.find((o) => o.value === estimate.paymentTerms)?.label ?? estimate.paymentTerms}
              </Text>
            </View>
          ) : <View style={S.metaCell} />}
          <View style={S.metaCell} />
        </View>

        {/* ── line items ─────────────────────────────────────────────── */}
        {estimate.tiersEnabled ? (
          TIER_ORDER.map((tierKey) => {
            const items = estimate.lineItems.filter((li) => li.tier === tierKey);
            if (items.length === 0) return null;
            const tierTotalCents = items.reduce((sum, li) => sum + li.totalCents, 0);
            return (
              <View key={tierKey} style={S.tierGroup}>
                <View style={[S.tierBanner, { backgroundColor: accentColor }]}>
                  <Text style={S.tierBannerText}>{estimate.tierLabels[tierKey]}</Text>
                </View>
                <View style={[S.tableHeader, { backgroundColor: "#334155" }]}>
                  <View style={S.cellService}><Text style={S.tableHeaderText}>Service</Text></View>
                  <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>OCC</Text></View>
                  <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Qty</Text></View>
                  <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Unit</Text></View>
                  <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Rate</Text></View>
                  <View style={S.cellTotal}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Total</Text></View>
                </View>
                {items.map((li, i) => (
                  <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                    <View style={S.cellService}>
                      <Text style={S.serviceNameText}>{li.serviceName ?? "Service"}</Text>
                      {li.estimateDesc ? (
                        <Text style={S.serviceDescText}>{li.estimateDesc.replace(/<[^>]+>/g, "")}</Text>
                      ) : null}
                    </View>
                    <View style={S.cellNum}><Text style={S.cellText}>{li.visits}</Text></View>
                    <View style={S.cellNum}><Text style={S.cellText}>{li.qty.toLocaleString()}</Text></View>
                    <View style={S.cellNum}><Text style={S.cellText}>{li.unitType ?? "—"}</Text></View>
                    <View style={S.cellNum}><Text style={S.cellText}>{cents(li.rateCents)}</Text></View>
                    <View style={S.cellTotal}><Text style={[S.cellText, { textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{cents(li.totalCents)}</Text></View>
                  </View>
                ))}
                <View style={S.tierSubtotalRow}>
                  <Text style={S.tierSubtotalLabel}>{estimate.tierLabels[tierKey]} Total</Text>
                  <Text style={[S.tierSubtotalValue, { color: accentColor }]}>{cents(tierTotalCents)}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <>
            <View style={[S.tableHeader, { backgroundColor: accentColor }]}>
              <View style={S.cellService}><Text style={S.tableHeaderText}>Service</Text></View>
              <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>OCC</Text></View>
              <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Qty</Text></View>
              <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Unit</Text></View>
              <View style={S.cellNum}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Rate</Text></View>
              <View style={S.cellTotal}><Text style={[S.tableHeaderText, { textAlign: "right" }]}>Total</Text></View>
            </View>

            {estimate.lineItems.map((li, i) => (
              <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                <View style={S.cellService}>
                  <Text style={S.serviceNameText}>{li.serviceName ?? "Service"}</Text>
                  {li.estimateDesc ? (
                    <Text style={S.serviceDescText}>{li.estimateDesc.replace(/<[^>]+>/g, "")}</Text>
                  ) : null}
                </View>
                <View style={S.cellNum}><Text style={S.cellText}>{li.visits}</Text></View>
                <View style={S.cellNum}><Text style={S.cellText}>{li.qty.toLocaleString()}</Text></View>
                <View style={S.cellNum}><Text style={S.cellText}>{li.unitType ?? "—"}</Text></View>
                <View style={S.cellNum}><Text style={S.cellText}>{cents(li.rateCents)}</Text></View>
                <View style={S.cellTotal}><Text style={[S.cellText, { textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{cents(li.totalCents)}</Text></View>
              </View>
            ))}
          </>
        )}

        {/* ── totals ─────────────────────────────────────────────────── */}
        {estimate.tiersEnabled ? (
          estimate.depositRequiredCents > 0 && (
            <View style={S.totalsBlock}>
              <View style={S.totalsRow}>
                <Text style={[S.totalsLabel, { fontFamily: "Helvetica-Bold" }]}>Deposit Required</Text>
                <Text style={S.totalsValue}>{cents(estimate.depositRequiredCents)}</Text>
              </View>
            </View>
          )
        ) : (
          <View style={S.totalsBlock}>
            <View style={S.totalsRow}>
              <Text style={S.totalsLabel}>Subtotal</Text>
              <Text style={S.totalsValue}>{cents(estimate.subtotalCents)}</Text>
            </View>
            {estimate.showDiscounts && estimate.discountCents > 0 && (
              <View style={S.totalsRow}>
                <Text style={[S.totalsLabel, { color: "#16a34a" }]}>Discount</Text>
                <Text style={[S.totalsValue, { color: "#16a34a" }]}>-{cents(estimate.discountCents)}</Text>
              </View>
            )}
            {estimate.taxRateBps > 0 && (
              <View style={S.totalsRow}>
                <Text style={S.totalsLabel}>Tax ({bpsToPercent(estimate.taxRateBps)})</Text>
                <Text style={S.totalsValue}>{cents(estimate.taxCents)}</Text>
              </View>
            )}
            <View style={S.totalDivider} />
            <View style={S.grandTotalRow}>
              <Text style={S.grandTotalLabel}>Total</Text>
              <Text style={[S.grandTotalValue, { color: accentColor }]}>{cents(estimate.totalCents)}</Text>
            </View>
            {estimate.depositRequiredCents > 0 && (
              <View style={S.totalsRow}>
                <Text style={[S.totalsLabel, { fontFamily: "Helvetica-Bold" }]}>Deposit Required</Text>
                <Text style={S.totalsValue}>{cents(estimate.depositRequiredCents)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── payment schedule ───────────────────────────────────────── */}
        {installmentSchedule.length > 0 && (
          <View style={S.scheduleSection}>
            <Text style={S.scheduleLabel}>Payment Schedule</Text>
            {installmentSchedule.map((inst) => (
              <View key={inst.number} style={S.scheduleRow}>
                <Text style={S.scheduleText}>Installment {inst.number} of {installmentSchedule.length} — due {formatDate(inst.dueDate)}</Text>
                <Text style={[S.scheduleText, { fontFamily: "Helvetica-Bold" }]}>{cents(inst.amountCents)}</Text>
              </View>
            ))}
          </View>
        )}
        {estimate.paymentPlanType === "milestones" && estimate.milestones.length > 0 && (
          <View style={S.scheduleSection}>
            <Text style={S.scheduleLabel}>Payment Schedule</Text>
            {estimate.milestones.map((m, i) => (
              <View key={i} style={S.scheduleRow}>
                <Text style={S.scheduleText}>{m.name}</Text>
                <Text style={[S.scheduleText, { fontFamily: "Helvetica-Bold" }]}>{cents(m.amountCents)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── notes ──────────────────────────────────────────────────── */}
        {estimate.notes ? (
          <View style={S.notesSection}>
            <Text style={S.notesLabel}>Notes</Text>
            <Text style={S.notesText}>{estimate.notes}</Text>
          </View>
        ) : null}

        {/* ── signature ──────────────────────────────────────────────── */}
        <View style={S.signatureSection}>
          <View style={S.signatureRow}>
            <View style={S.signatureBlock}>
              <View style={S.signatureLine} />
              <Text style={S.signatureLabel}>Client Signature</Text>
            </View>
            <View style={S.signatureBlock}>
              <View style={S.signatureLine} />
              <Text style={S.signatureLabel}>Date</Text>
            </View>
            <View style={S.signatureBlock}>
              <View style={S.signatureLine} />
              <Text style={S.signatureLabel}>Print Name</Text>
            </View>
          </View>
        </View>

        {/* ── footer ─────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{org.name} · {org.phone}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
}
