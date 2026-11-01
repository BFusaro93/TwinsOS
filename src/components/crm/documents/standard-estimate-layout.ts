import { serializeColumnsContent } from "@/lib/utils/document-template-renderer";

export interface StarterBlock {
  blockType: "paragraph" | "columns" | "estimate_grid" | "divider" | "spacer";
  orderIndex: number;
  content: string | null;
  settings: Record<string, unknown>;
}

/**
 * The Service Autopilot-style proposal layout: company header beside a logo,
 * greeting, the estimate grid, a divider and a terms placeholder.
 */
export function buildStandardEstimateBlocks(): StarterBlock[] {
  const blocks: Omit<StarterBlock, "orderIndex">[] = [
    {
      blockType: "columns",
      content: serializeColumnsContent({
        count: 2,
        columns: [
          "<p><strong>[companyname]</strong><br>[companyaddress]<br>[companycity], [companystate] [companyzip]<br>[companyphone]</p>",
          "<p>Your logo here. Click this box, then use the Insert image button in the toolbar.</p>",
        ],
      }),
      settings: {},
    },
    { blockType: "spacer", content: null, settings: {} },
    {
      blockType: "paragraph",
      content:
        "<p>Hello [clientfirstname],</p><p>Thank you for the opportunity to earn your business. Below is your estimate [estimatenumber] for the work at [physicaladdress1]. This estimate is valid until [estimatevaliduntil].</p>",
      settings: {},
    },
    { blockType: "estimate_grid", content: null, settings: {} },
    { blockType: "divider", content: null, settings: {} },
    {
      blockType: "paragraph",
      content: "<p>Terms and conditions: replace this text with your terms, payment schedule and scope-of-work notes.</p>",
      settings: {},
    },
  ];
  return blocks.map((b, i) => ({ ...b, orderIndex: i }));
}
