import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { adminClient, peekApiKeyScopes } from "@/lib/api/auth";
import { logger } from "@/lib/logger";
import { registerResourceTools } from "./tools";
import { registerDocsTools } from "./docs-tools";

const log = logger.child("mcp-server");

/**
 * MCP entry point for the public API — same api_keys/scopes as /api/v1, a
 * different protocol on top. Stateless Streamable HTTP: a fresh McpServer +
 * transport per request (no in-memory session state), matching how the REST
 * routes and Vercel's serverless model both already work. Tools are
 * registered per-request based on the connecting key's scopes (see
 * registerResourceTools in ./tools.ts) — a key only ever sees tools it's
 * actually allowed to call, rather than a fixed tool list gated per-call.
 *
 * Auth here uses peekApiKeyScopes (no rate-limit charge) rather than
 * resolveApiKey: each resource tool delegates to the real REST route
 * handler, which runs its own full authenticateApiRequest() — that's where
 * the rate-limit increment for the call actually happens, exactly once.
 * Charging it again here too would silently halve every key's effective
 * rate limit for MCP traffic vs. REST traffic.
 */
async function handleMcpRequest(request: Request): Promise<Response> {
  const db = adminClient();
  const auth = await peekApiKeyScopes(request, db);
  if (!auth.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: auth.error }, id: null },
      { status: auth.status }
    );
  }

  const server = new McpServer({ name: "twinsos", version: "0.1.0" });

  // whoami is always available (even to a key with zero resource scopes) so
  // a connecting agent can see what it's working with. The SDK only wires
  // up tools/list + tools/call the first time a tool is registered
  // (confirmed directly against the SDK — an empty tool set otherwise
  // answers tools/list with "Method not found", not `{ tools: [] }`), so
  // this also guarantees there's always at least one tool.
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

  registerResourceTools(server, request, auth.scopes);
  registerDocsTools(server);

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
