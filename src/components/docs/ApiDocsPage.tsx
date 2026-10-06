import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";
import { buildOpenApiDocument } from "@/lib/api/openapi";

const METHOD_COLORS: Record<string, string> = {
  get: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  post: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  patch: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
};

const TIER_COLORS: Record<string, string> = {
  read: "bg-muted text-slate-600 dark:text-neutral-400",
  "write:safe": "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400",
  "write:sensitive": "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
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

/**
 * The endpoint-by-endpoint public API + MCP reference. Mounted in all three
 * shells (/docs/api-docs, /crm/docs/api-docs, /settings/support/api-docs) so
 * following the link out of a guide keeps you in the product you were reading
 * it from — same arrangement as the guides themselves, and dressed the same way
 * so it doesn't read as an app screen wedged into the docs.
 */
export function ApiDocsPage() {
  const doc = buildOpenApiDocument();
  const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;

  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Integrations"
        title="Public API"
        description="Scoped, API-key-authenticated access to Equipt and Landscapt resources. Create keys under Settings > Integrations."
      />

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-neutral-100">Authentication</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
          Every request must include{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer &lt;your-api-key&gt;
          </code>
          . A key only sees data for the organization it was created in, and only for the scopes granted at
          creation time. Keys are rate-limited per minute; a request over the limit gets a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">429</code>.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
          Machine-readable spec:{" "}
          <a href="/api/openapi" className="text-brand-600 dark:text-brand-400 hover:underline">
            /api/openapi
          </a>
        </p>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-neutral-100">MCP (for AI agents)</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/api/mcp</code> exposes the same
          API keys and scopes as an MCP server, so an AI agent (Claude, or any other MCP client) can be pointed at
          your Landscapt data directly. Connect with the same{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer &lt;your-api-key&gt;
          </code>{" "}
          header — no separate credential. A key only ever sees tools for the scopes it was granted; a key with no
          scopes still gets a <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">whoami</code>{" "}
          tool so the agent can see which org/scopes it&apos;s connected as.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
          Every tool call is charged against the key&apos;s rate limit exactly once, the same as a direct REST call.
          Each endpoint below shows the MCP tool name it maps to. Resources with no create/update endpoint here (
          estimates, invoices, contracts, purchase orders) have no corresponding write tool either — an agent can
          read but never create or edit them. See{" "}
          <span className="font-mono text-xs">TASKS.md</span> for why estimate creation in particular stays
          human-only for now.
        </p>
      </section>

      {Object.entries(paths).map(([path, methods]) => (
        <section key={path} className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">{path}</h2>
          <div className="flex flex-col gap-4">
            {Object.entries(methods).map(([method, op]) => {
              const requestBody = op.requestBody as
                | { content?: { "application/json"?: { schema?: unknown } } }
                | undefined;
              const schema = requestBody?.content?.["application/json"]?.schema;
              const hasIdParam = path.endsWith("/{id}");
              const toolName = mcpToolNames(path, method, hasIdParam);
              return (
                <div key={method} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${METHOD_COLORS[method] ?? "bg-muted text-slate-600 dark:text-neutral-400"}`}
                    >
                      {method}
                    </span>
                    <span className="text-sm font-medium text-slate-800 dark:text-neutral-100">{op.summary as string}</span>
                    {toolName ? (
                      <span className="rounded-full bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-xs font-mono text-purple-700 dark:text-purple-400">
                        mcp: {toolName}
                      </span>
                    ) : null}
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-slate-600 dark:text-neutral-400">
                      scope: {op["x-required-scope"] as string}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLORS[op["x-agent-tier"] as string] ?? "bg-muted text-slate-600 dark:text-neutral-400"}`}
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
    </DocsFontScope>
  );
}
