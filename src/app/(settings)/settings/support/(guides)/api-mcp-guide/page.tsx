import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const RESOURCES: [string, string][] = [
  ["Clients", "Read, Write"],
  ["Estimates", "Read, Write*"],
  ["Jobs", "Read, Write"],
  ["Invoices", "Read"],
  ["Contracts", "Read"],
  ["Assets", "Read, Write"],
  ["Work Orders", "Read, Write"],
  ["PM Schedules", "Read, Write"],
  ["Parts", "Read, Write"],
  ["Requisitions", "Read, Write, Write (sensitive)"],
  ["Purchase Orders", "Read"],
  ["Vendors", "Read, Write"],
  ["Products", "Read, Write"],
  ["Projects", "Read, Write"],
];

const TOOL_PATTERN: [string, string, string][] = [
  ["GET (list)", "no id in the path", "list_<resource> — e.g. list_clients"],
  ["GET (single)", "id in the path", "get_<resource> — e.g. get_clients"],
  ["POST", "creates a record", "create_<resource> — e.g. create_jobs"],
  ["PATCH", "updates a record", "update_<resource> — e.g. update_jobs"],
];

export default function ApiMcpGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Integrations"
        title="API Keys & MCP"
        description="How scoped API keys work, and how to hand the same key to an AI agent over MCP."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#concepts">The big idea</TOCLink>
          <TOCLink href="#creating-a-key">Creating a key</TOCLink>
          <TOCLink href="#scopes">Resources & scopes</TOCLink>
          <TOCLink href="#walkthrough">Walkthrough: a read-only reporting key</TOCLink>
          <TOCLink href="#mcp">Using the key with MCP</TOCLink>
          <TOCLink href="#docs-tools">Answering &quot;how do I&hellip;&quot; from the help docs</TOCLink>
          <TOCLink href="#why-one-system">Why REST and MCP share one key</TOCLink>
          <TOCLink href="#managing-keys">Rate limits, errors & revoking</TOCLink>
        </div>
      </div>

      <Section id="concepts" title="The big idea">
        <p>
          A <strong>Public API Key</strong> is a scoped credential your org issues itself, separate
          from the single all-or-nothing key used for the Zapier connection (see{" "}
          <a href="/settings/support/zapier-guide" className="text-[#60ab45] hover:text-[#4a8a33] hover:underline">
            the Zapier guide
          </a>{" "}
          for that one). You can issue as many of these as you need — one per integration, one per
          script, one per AI agent — each with only the scopes that integration actually requires.
        </p>
        <p>
          Every key works two ways with zero extra setup: as a normal <strong>REST API</strong>{" "}
          credential, and as an <strong>MCP</strong> (Model Context Protocol) connection an AI agent
          can use to read and act on your data directly. Same key, same scopes, same rate limit — you
          don&apos;t choose one or the other when you create it.
        </p>
        <p>
          This page explains the concepts and walks through a real setup. For the exhaustive,
          endpoint-by-endpoint reference — every route, request/response shape, required scope, and
          the exact MCP tool name it maps to — see{" "}
          <a href="/settings/support/api-docs" className="text-[#60ab45] hover:text-[#4a8a33] hover:underline">
            the full endpoint reference
          </a>
          .
        </p>
      </Section>

      <Section id="creating-a-key" title="Creating a key">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <strong>Master Account Settings → Integrations</strong> and find the{" "}
            <strong>Public API Keys</strong> card — it sits below the Zapier connection, and is
            unrelated to it.
          </li>
          <li>
            Click <strong>Create Key</strong>, give it a descriptive name (e.g. &quot;Reporting
            integration&quot; or &quot;Ops agent&quot;), then check the boxes for exactly the scopes
            it needs from the resource checklist.
          </li>
          <li>
            Click <strong>Create Key</strong> in the dialog. The plaintext key is shown{" "}
            <strong>once</strong>, right there — copy it before closing. It is never displayed again
            in full; the list view afterward only shows a short prefix.
          </li>
          <li>
            The same dialog also shows a ready-to-paste MCP client config block — see{" "}
            <a href="#mcp" className="text-[#60ab45] hover:text-[#4a8a33] hover:underline">
              Using the key with MCP
            </a>{" "}
            below.
          </li>
        </ol>
        <Callout>
          <strong>There is no &quot;edit scopes&quot; on an existing key.</strong> If a key needs
          different access later, create a new key with the right scopes and revoke the old one —
          scopes are fixed at creation time.
        </Callout>
      </Section>

      <Section id="scopes" title="Resources & scopes">
        <p>
          Every request — REST or MCP — is checked against the connecting key&apos;s scopes before it
          touches the database. A scope is written as <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">resource:tier</code>,
          e.g. <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">clients:read</code> or{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">requisitions:write:sensitive</code>.
          There are 14 resources spanning both products, each offering some combination of{" "}
          <strong>Read</strong>, <strong>Write</strong>, and — for the resources with real financial
          or ordering weight — <strong>Write (sensitive)</strong>.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">Available tiers</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {RESOURCES.map(([name, tiers]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{tiers}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A few of these are intentionally read-only end to end — <strong>Invoices</strong>,{" "}
          <strong>Contracts</strong>, and <strong>Purchase Orders</strong> have no create or update
          endpoint at all, by any key, under any scope. <strong>Estimates</strong> is a narrower case:
          it offers a <em>Write</em> scope, but the only thing that scope unlocks is adding a single
          catalog-priced line to an existing estimate — every dollar figure is still computed by the
          app&apos;s own budget engine, never supplied by the caller, and there is no update or
          full-estimate-build path via the API. Full estimate authoring stays a human, in-app action.
        </p>
        <p>
          For the full mapping of REST verb → required scope → MCP tool name, per endpoint, see{" "}
          <a href="/settings/support/api-docs" className="text-[#60ab45] hover:text-[#4a8a33] hover:underline">
            the full endpoint reference
          </a>
          .
        </p>
      </Section>

      <Section id="walkthrough" title="Walkthrough: a read-only reporting key">
        <p>
          Say you want an AI agent to pull numbers for a weekly ops summary — clients, jobs, and
          invoices — and nothing else. It should never be able to create or change anything. Here&apos;s
          the exact setup:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Create Key</strong> → name it something like &quot;Weekly reporting (read-only)&quot;.
          </li>
          <li>
            In the scope checklist, check only three boxes: <strong>Clients → Read</strong>,{" "}
            <strong>Jobs → Read</strong>, <strong>Invoices → Read</strong>. Leave everything else —
            including Write on those same three resources — unchecked.
          </li>
          <li>
            Click <strong>Create Key</strong>. Copy the plaintext key from the reveal dialog, and copy
            the MCP config block underneath it too (it&apos;s pre-filled with this exact key).
          </li>
          <li>
            <strong>If you use Claude Code</strong>, run the command shown in that same dialog — it
            looks like this, and you paste the whole thing at your terminal prompt (it&apos;s one
            command, not a file to edit):
          </li>
        </ol>
        <pre className="overflow-x-auto rounded-md bg-[#0a1f18] p-3 text-xs text-[#d7f0c9]">
{`claude mcp add --transport http landscapt https://<your-domain>/api/mcp --header "Authorization: Bearer <your-api-key>"`}
        </pre>
        <ol start={5} className="list-decimal space-y-2 pl-5">
          <li>
            <strong>If you use Claude Desktop (or any other MCP client)</strong> instead, open its
            settings → <strong>Developer → Edit Config</strong>, and paste the JSON block from the same
            dialog into{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">claude_desktop_config.json</code>{" "}
            under <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">mcpServers</code> (merge
            it in if other servers are already configured there) — this is a config-file snippet, not a
            command, so it goes in that file, never into a terminal. It looks like this:
          </li>
        </ol>
        <pre className="overflow-x-auto rounded-md bg-[#0a1f18] p-3 text-xs text-[#d7f0c9]">
{`{
  "mcpServers": {
    "landscapt": {
      "url": "https://<your-domain>/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`}
        </pre>
        <ol start={6} className="list-decimal space-y-2 pl-5">
          <li>Restart Claude Desktop (or Claude Code). It connects to the MCP server and negotiates available tools.</li>
          <li>
            Because this key only has three <em>read</em> scopes, the agent sees exactly six tools:{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">whoami</code>,{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">list_clients</code> /{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">get_clients</code>,{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">list_jobs</code> /{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">get_jobs</code>, and{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">list_invoices</code> /{" "}
            <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">get_invoices</code>.
            No create or update tool exists for it at all — not because it was denied at call time, but
            because those tools were never registered for this key in the first place.
          </li>
        </ol>
        <Callout>
          <strong>Least privilege, by design.</strong> If this key ever leaked — pasted in the wrong
          Slack channel, committed to a repo — the blast radius is read access to clients, jobs, and
          invoices. It could not create a client, edit a job, touch a purchase order, or see anything
          in Equipt&apos;s asset or parts inventory. Scoping tightly at creation time is the actual
          security control here, not an afterthought — always grant the narrowest set of scopes a key
          needs and nothing more.
        </Callout>
      </Section>

      <Section id="mcp" title="Using the key with MCP">
        <p>
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">/api/mcp</code> is the
          same API you&apos;d call over REST, exposed as an MCP server instead. There is no separate
          MCP credential to generate — any Public API Key you&apos;ve already created works immediately
          as an MCP connection, with the same scopes it was granted for REST.
        </p>
        <p>
          Connect any MCP client — Claude Desktop, Claude Code, or any other MCP-compatible tool — by
          pointing it at that URL with the standard header:
        </p>
        <pre className="overflow-x-auto rounded-md bg-[#0a1f18] p-3 text-xs text-[#d7f0c9]">
{`Authorization: Bearer <your-api-key>`}
        </pre>
        <Callout>
          <strong>Two common ways this trips people up:</strong>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              The key-creation dialog shows two different snippets — a <strong>command</strong> (for
              Claude Code, starts with <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">claude mcp add</code>)
              and a <strong>JSON config block</strong> (for every other MCP client). The command is
              meant to be pasted at a terminal prompt; the JSON is meant to be pasted into a config
              <em>file</em>. Pasting the JSON directly into a terminal will fail with a shell parse
              error — it isn&apos;t a command.
            </li>
            <li>
              <strong>Claude Code and Claude Desktop are the reliable path today.</strong> Claude.ai&apos;s
              web chat also has a &quot;custom connector&quot; option, but as of this writing its UI is
              built around OAuth (Authorization URL, Client ID/Secret) and doesn&apos;t consistently
              expose a field for a plain bearer token / API key the way this server needs. It may or may
              not work depending on what you&apos;re shown — Claude Code or Desktop won&apos;t have that
              problem.
            </li>
          </ul>
        </Callout>
        <p>Tool names follow one fixed convention, generated directly from the REST route each tool calls:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">REST verb</th>
              <th className="px-3 py-2">Shape</th>
              <th className="px-3 py-2">MCP tool name</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {TOOL_PATTERN.map(([verb, shape, tool]) => (
              <tr key={tool} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{verb}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{shape}</td>
                <td className="px-3 py-2 font-mono text-xs text-[#4a4a46]">{tool}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A key with <em>zero</em> resource scopes still connects successfully and gets three tools —{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">whoami</code>,{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">search_docs</code>, and{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">get_guide</code> — so an
          agent can at least confirm which org and scopes it&apos;s connected as, and answer &quot;how
          do I&hellip;&quot; questions from the help docs, before deciding what else to do — it never
          sees an empty, broken-looking connection.
        </p>
        <p>
          Every tool call is charged against the key&apos;s rate limit exactly once, the same as a
          direct REST call — there&apos;s no separate, more generous allowance for agent traffic. An
          agent that calls a tool in a loop burns the same budget a script hammering the REST endpoint
          would.
        </p>
      </Section>

      <Section id="docs-tools" title="Answering &quot;how do I&hellip;&quot; from the help docs">
        <p>
          Two tools are always available, regardless of the key&apos;s scopes, because they only read
          the same non-sensitive help content already visible at Support and Docs — no org data:{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">search_docs</code>{" "}
          (full-text search across every short Support article and every long-form Docs guide, e.g.
          Purchase Orders, Work Orders, Estimating) and{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">get_guide</code> (the
          full text of one guide, by the slug a search result points at).
        </p>
        <p>
          This is what lets a connected agent answer a genuine &quot;how do I convert a requisition to
          a PO&quot; or &quot;what does FIFO costing actually do here&quot; question from your own
          documentation instead of guessing from general knowledge — search first, then fetch the full
          guide if one result looks like the right one.
        </p>
        <Callout>
          <strong>Guide content is a generated index, not live.</strong> The long-form guides are
          ordinary app pages (JSX, not structured data), so their searchable text is pre-extracted into{" "}
          <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">
            src/lib/docs-guides-content.json
          </code>{" "}
          by <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">npm run docs:index</code>{" "}
          rather than rendered on every search call. If you&apos;re maintaining this app: re-run that
          script after adding or editing a guide, or search_docs and get_guide will keep returning the
          old text.
        </Callout>
      </Section>

      <Section id="why-one-system" title="Why REST and MCP share one key">
        <p>
          It would have been possible to build MCP as its own credential system — a separate &quot;MCP
          key&quot; with its own scope picker, issued and revoked independently of the REST keys. We
          didn&apos;t do that, on purpose.
        </p>
        <p>
          Under the hood, every MCP tool delegates to the exact same REST route handler the API uses —
          not a re-implementation of the same logic, the literal same function, called with the
          request&apos;s own Authorization header. That means a tool can never do anything, or see
          anything, that the equivalent REST call couldn&apos;t. There is only one place scopes are
          defined, one place they&apos;re enforced, and one mental model to reason about: a key&apos;s
          scopes are what it can do, full stop, regardless of which protocol asks.
        </p>
        <p>
          Practically, this means you scope a key once, thinking only in terms of &quot;what should
          this integration be able to see or change&quot; — never twice, and never having to remember
          which credential type governs which surface.
        </p>
      </Section>

      <Section id="managing-keys" title="Rate limits, errors & revoking">
        <p>
          Keys are rate-limited per minute. A request — REST or MCP — that exceeds the limit gets back
          a <code className="rounded bg-[#f4f6f0] px-1 py-0.5 font-mono text-xs">429</code>. A request
          for a scope the key wasn&apos;t granted is rejected before it reaches any business logic,
          rather than returning partial or filtered data.
        </p>
        <p>
          <strong>Revoking</strong> a key (from the same Public API Keys card) takes effect
          immediately — any REST client or MCP connection using it loses access right away, mid-session
          included. This cannot be undone; if the integration needs access again, issue a new key.
        </p>
        <Callout>
          Revoked keys stay listed, greyed out, for your own audit trail — they just stop working.
          There&apos;s no &quot;pause&quot; short of revoking; if you need a key temporarily disabled,
          revoke it and create a fresh one when it&apos;s needed again. Once a key is revoked, a{" "}
          <strong>Remove</strong> button next to it lets you clear it from the list entirely if it&apos;s
          just clutter — that only hides it from view, it doesn&apos;t erase the underlying audit record.
        </Callout>
      </Section>
    </DocsFontScope>
  );
}
