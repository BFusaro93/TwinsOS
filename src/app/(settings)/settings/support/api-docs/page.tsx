import { PageHeader } from "@/components/shared/PageHeader";
import { buildOpenApiDocument } from "@/lib/api/openapi";

const METHOD_COLORS: Record<string, string> = {
  get: "bg-blue-100 text-blue-700",
  post: "bg-green-100 text-green-700",
  patch: "bg-amber-100 text-amber-700",
};

const TIER_COLORS: Record<string, string> = {
  read: "bg-slate-100 text-slate-600",
  "write:safe": "bg-indigo-100 text-indigo-700",
  "write:sensitive": "bg-red-100 text-red-700",
};

/** Derives the MCP tool name(s) a given OpenAPI path+method maps to — mirrors the naming in src/app/api/mcp/tools.ts. */
function mcpToolNames(path: string, method: string, hasIdParam: boolean): string | null {
  const resource = path
    .replace(/\/\{id\}$/, "")
    .replace(/^\//, "")
    .replace(/-/g, "_");
  if (method === "get") return hasIdParam ? `get_${resource}` : `list_${resource}`;
  if (method === "post") return `create_${resource}`;
  if (method === "patch") return `update_${resource}`;
  return null;
}

export default function ApiDocsPage() {
  const doc = buildOpenApiDocument();
  const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;

  return (
    <div className="flex flex-col gap-6 pb-4">
      <PageHeader
        title="Public API"
        description="Scoped, API-key-authenticated access to Equipt and Landscapt resources. Create keys under Settings > Integrations."
      />

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Authentication</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Every request must include{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer &lt;your-api-key&gt;
          </code>
          . A key only sees data for the organization it was created in, and only for the scopes granted at
          creation time. Keys are rate-limited per minute; a request over the limit gets a{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">429</code>.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Machine-readable spec:{" "}
          <a href="/api/openapi" className="text-brand-600 hover:underline">
            /api/openapi
          </a>
        </p>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">MCP (for AI agents)</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">/api/mcp</code> exposes the same
          API keys and scopes as an MCP server, so an AI agent (Claude, or any other MCP client) can be pointed at
          your TwinsOS data directly. Connect with the same{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer &lt;your-api-key&gt;
          </code>{" "}
          header — no separate credential. A key only ever sees tools for the scopes it was granted; a key with no
          scopes still gets a <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">whoami</code>{" "}
          tool so the agent can see which org/scopes it&apos;s connected as.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Every tool call is charged against the key&apos;s rate limit exactly once, the same as a direct REST call.
          Each endpoint below shows the MCP tool name it maps to. Resources with no create/update endpoint here (
          estimates, invoices, contracts, purchase orders) have no corresponding write tool either — an agent can
          read but never create or edit them. See{" "}
          <span className="font-mono text-xs">TASKS.md</span> for why estimate creation in particular stays
          human-only for now.
        </p>
      </section>

      {Object.entries(paths).map(([path, methods]) => (
        <section key={path} className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-sm font-semibold text-slate-900">{path}</h2>
          <div className="flex flex-col gap-4">
            {Object.entries(methods).map(([method, op]) => {
              const requestBody = op.requestBody as
                | { content?: { "application/json"?: { schema?: unknown } } }
                | undefined;
              const schema = requestBody?.content?.["application/json"]?.schema;
              const hasIdParam = path.endsWith("/{id}");
              const toolName = mcpToolNames(path, method, hasIdParam);
              return (
                <div key={method} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${METHOD_COLORS[method] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {method}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{op.summary as string}</span>
                    {toolName ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-mono text-purple-700">
                        mcp: {toolName}
                      </span>
                    ) : null}
                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
                      scope: {op["x-required-scope"] as string}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLORS[op["x-agent-tier"] as string] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {op["x-agent-tier"] as string}
                    </span>
                  </div>
                  {schema ? (
                    <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
                      {JSON.stringify(schema, null, 2)}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
