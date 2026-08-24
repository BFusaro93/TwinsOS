import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { adminClient, resolveApiKey } from "@/lib/api/auth";
import { logger } from "@/lib/logger";

const log = logger.child("mcp-server");

/**
 * MCP entry point for the public API — same api_keys/scopes as /api/v1, a
 * different protocol on top. Stateless Streamable HTTP: a fresh McpServer +
 * transport per request (no in-memory session state), matching how the REST
 * routes and Vercel's serverless model both already work. Tools are
 * registered per-request based on the authenticated key's scopes (see
 * buildToolSet in ./tools.ts, added in a later phase of this build) — a key
 * only ever sees tools it's actually allowed to call, rather than a fixed
 * tool list gated per-call.
 */
async function handleMcpRequest(request: Request): Promise<Response> {
  const db = adminClient();
  const auth = await resolveApiKey(request, db);
  if (!auth.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: auth.error }, id: null },
      { status: auth.status }
    );
  }

  const server = new McpServer({ name: "twinsos", version: "0.1.0" });

  // The full resource tool set (read / write:safe, generated from the same
  // ENDPOINTS registry as the OpenAPI spec) lands in the next part of this
  // phase. One tool is registered here regardless: the SDK only wires up
  // its tools/list + tools/call request handlers the first time a tool is
  // registered (confirmed against the SDK directly — an empty tool set
  // otherwise answers tools/list with "Method not found", not `{ tools: [] }`),
  // so a real first tool is required, not just harmless to add. `whoami` is
  // a natural pick: it lets a connecting agent see which org/scopes the key
  // it was handed actually has before trying anything else.
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Returns the organization and scopes for the API key used to connect.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify({ orgId: auth.orgId, scopes: auth.scopes }) }],
    })
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    log.error("request failed", { err, orgId: auth.orgId });
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}
