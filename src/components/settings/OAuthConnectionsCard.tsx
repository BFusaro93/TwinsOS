"use client";

import { useOAuthConnections, useDisconnectOAuthConnection } from "@/lib/hooks/use-oauth-connections";
import { Button } from "@/components/ui/button";

/**
 * Lists apps connected via the OAuth 2.1 sign-in flow (src/app/oauth/authorize,
 * src/app/api/mcp/oauth/*) -- e.g. Claude.ai's connector, signed in with a
 * "sign in and approve" flow instead of a manually-created API key. Sits
 * alongside ApiKeysCard in Settings; the two are separate lists because an
 * OAuth connection is tied to the signed-in user who approved it, not
 * issued directly by an admin.
 */
export function OAuthConnectionsCard() {
  const { data: connections, isLoading } = useOAuthConnections();
  const disconnect = useDisconnectOAuthConnection();

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-6 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Connected Apps</h3>
        <p className="mt-1 text-sm text-slate-500">Apps signed in via OAuth (e.g. Claude.ai&apos;s connector) — separate from the API keys above.</p>
      </div>

      <div className="px-6 py-5">
        {isLoading && <p className="text-sm text-slate-400">Loading…</p>}

        {!isLoading && (connections ?? []).length === 0 && (
          <p className="text-sm text-slate-400">No apps connected yet.</p>
        )}

        {(connections ?? []).length > 0 && (
          <ul className="divide-y">
            {connections!.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{conn.clientName}</p>
                  <p className="text-xs text-slate-500">
                    {conn.connectedByName ? `Connected by ${conn.connectedByName}` : "Connected"} ·{" "}
                    {conn.scopes.length} scope{conn.scopes.length === 1 ? "" : "s"} ·{" "}
                    {conn.lastUsedAt ? `last used ${new Date(conn.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:bg-red-50"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate(conn.id)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
