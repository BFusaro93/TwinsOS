import type { ReactNode } from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { htmlToPdfNodes } from "@/lib/utils/html-to-pdf";
import { parseColumnsContent } from "@/lib/utils/document-template-renderer";
import type { BlockType } from "@/types/crm-documents";

export interface DocumentPdfBlock {
  blockType: BlockType;
  orderIndex: number;
  content: string | null;
  settings?: Record<string, unknown> | null;
}

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
  },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  paragraph: { fontSize: 9, marginBottom: 10, lineHeight: 1.4 },
  signature: { fontSize: 8, color: "#475569", marginTop: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 10 },
  spacer: { height: 16 },
  image: { maxWidth: "100%", marginBottom: 10, objectFit: "contain" },
  imagePlaceholder: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#94a3b8",
    textAlign: "center",
    padding: 16,
    fontSize: 8,
    marginBottom: 10,
  },
  lineItemsPlaceholder: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#94a3b8",
    textAlign: "center",
    padding: 16,
    fontSize: 8,
    marginBottom: 10,
  },
  button: {
    alignSelf: "center",
    backgroundColor: "#60ab45",
    color: "#ffffff",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    marginVertical: 8,
  },
});

function renderBlock(block: DocumentPdfBlock, key: number, renderGrid?: () => ReactNode) {
  switch (block.blockType) {
    case "header":
      return <View key={key} wrap={false}>{htmlToPdfNodes(block.content ?? "", S.header)}</View>;
    case "paragraph":
    case "list":
      return <View key={key}>{htmlToPdfNodes(block.content ?? "", S.paragraph)}</View>;
    case "signature":
      return <View key={key} wrap={false}>{htmlToPdfNodes(block.content ?? "", S.signature)}</View>;
    case "columns": {
      const { count, columns } = parseColumnsContent(block.content);
      return (
        <View key={key} style={{ flexDirection: "row", marginBottom: 8 }}>
          {columns.slice(0, count).map((html, i) => (
            <View key={i} style={{ flex: 1, paddingRight: i < count - 1 ? 8 : 0, paddingLeft: i > 0 ? 8 : 0 }}>
              {htmlToPdfNodes(html, S.paragraph)}
            </View>
          ))}
        </View>
      );
    }
    case "divider":
      return <View key={key} style={S.divider} />;
    case "spacer":
      return <View key={key} style={S.spacer} />;
    case "image": {
      const w = Number(block.settings?.width);
      const widthPct = Number.isFinite(w) && w >= 10 && w <= 100 ? Math.round(w) : 100;
      return block.content ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image key={key} src={block.content} style={{ ...S.image, width: `${widthPct}%`, alignSelf: "center" }} />
      ) : (
        <Text key={key} style={S.imagePlaceholder}>[No image selected]</Text>
      );
    }
    case "line_items":
      return (
        <Text key={key} style={S.lineItemsPlaceholder}>
          Line items will appear here automatically when this document is sent.
        </Text>
      );
    case "estimate_grid":
      // An Estimate document's dynamic line-items section. The estimate PDF
      // supplies the real one; a standalone template PDF has no estimate.
      return renderGrid ? (
        <View key={key}>{renderGrid()}</View>
      ) : (
        <Text key={key} style={S.lineItemsPlaceholder}>
          The estimate&apos;s line items and totals appear here automatically.
        </Text>
      );
    case "button":
      return (
        <Text key={key} style={S.button}>
          {block.content || "Button"}
        </Text>
      );
    default:
      return null;
  }
}

/** The blocks as react-pdf nodes, in order. `renderGrid` supplies the
 *  estimate_grid block's content (only the first grid block renders it). */
export function DocumentPdfBlocks({
  blocks,
  renderGrid,
}: {
  blocks: DocumentPdfBlock[];
  renderGrid?: () => ReactNode;
}) {
  const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  let gridUsed = false;
  return (
    <>
      {sorted.map((b, i) => {
        if (b.blockType === "estimate_grid") {
          if (gridUsed) return null;
          gridUsed = true;
        }
        return renderBlock(b, i, renderGrid);
      })}
    </>
  );
}

export function DocumentTemplatePdf({
  blocks,
  title,
}: {
  blocks: DocumentPdfBlock[];
  title: string;
}) {
  const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  return (
    <Document title={title}>
      <Page size="LETTER" style={S.page}>
        <DocumentPdfBlocks blocks={sorted} />
      </Page>
    </Document>
  );
}
