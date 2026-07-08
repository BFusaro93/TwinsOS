import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { htmlToPdfNodes } from "@/lib/utils/html-to-pdf";
import type { BlockType } from "@/types/crm-documents";

export interface DocumentPdfBlock {
  blockType: BlockType;
  orderIndex: number;
  content: string | null;
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

function renderBlock(block: DocumentPdfBlock, key: number) {
  switch (block.blockType) {
    case "header":
      return <View key={key} wrap={false}>{htmlToPdfNodes(block.content ?? "", S.header)}</View>;
    case "paragraph":
    case "list":
      return <View key={key}>{htmlToPdfNodes(block.content ?? "", S.paragraph)}</View>;
    case "signature":
      return <View key={key} wrap={false}>{htmlToPdfNodes(block.content ?? "", S.signature)}</View>;
    case "divider":
      return <View key={key} style={S.divider} />;
    case "spacer":
      return <View key={key} style={S.spacer} />;
    case "image":
      return block.content ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image key={key} src={block.content} style={S.image} />
      ) : (
        <Text key={key} style={S.imagePlaceholder}>[No image selected]</Text>
      );
    case "line_items":
      return (
        <Text key={key} style={S.lineItemsPlaceholder}>
          Line items will appear here automatically when this document is sent.
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
        {sorted.map((b, i) => renderBlock(b, i))}
      </Page>
    </Document>
  );
}
