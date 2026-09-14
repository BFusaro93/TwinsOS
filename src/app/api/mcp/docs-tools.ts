import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchDocs, getGuideContent } from "@/lib/docs-search";
import { DOC_GUIDES } from "@/lib/docs-guides";

/**
 * Help-docs tools — search_docs and get_guide. Unlike registerResourceTools
 * in ./tools.ts, these are always registered regardless of the connecting
 * key's scopes: the content is the same non-sensitive help documentation
 * every user of the app can already read at /settings/support and
 * /settings/docs, not org data, so there's nothing here for a scope to
 * gate. This is what lets a connected AI agent answer "how do I do X in
 * this app" questions from the docs instead of only being able to read/
 * write business records.
 */
export function registerDocsTools(server: McpServer): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search help docs",
      description:
        "Full-text search across every in-app help article and long-form guide (Purchase Orders, Work Orders, Estimating, the Client Portal, etc.). Use this first when answering 'how do I...' or 'what does X mean' questions about how the app works, before guessing from general knowledge. Returns short excerpts — call get_guide with a result's slug for the full text of a long-form guide.",
      inputSchema: {
        query: z.string().min(2).describe("What to search for, e.g. 'convert requisition to PO' or 'FIFO costing'."),
        limit: z.number().int().positive().max(20).optional().describe("Max results to return (default 5)."),
      },
    },
    async ({ query, limit }) => {
      const results = searchDocs(query, limit ?? 5);
      return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
    }
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get a full help guide",
      description:
        "Fetches the full text of one long-form help guide by slug (from a search_docs result's path, e.g. 'purchase-orders-guide' from '/settings/support/purchase-orders-guide'). Use after search_docs points at a guide worth reading in full.",
      inputSchema: {
        slug: z.string().describe("The guide's slug, e.g. 'purchase-orders-guide'."),
      },
    },
    async ({ slug }) => {
      const guide = getGuideContent(slug);
      if (!guide) {
        const known = DOC_GUIDES.map((g) => g.slug).join(", ");
        return {
          content: [{ type: "text", text: `No guide found for slug "${slug}". Known slugs: ${known}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(guide) }] };
    }
  );
}
