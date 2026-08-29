"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useDeleteApiKey } from "@/lib/hooks/use-api-keys";
import { API_SCOPE_RESOURCES, scopeString, tierLabel } from "@/lib/api/scopes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

/**
 * Public API key management — lives in Master Account Settings > Integrations,
 * alongside ZapierIntegrationCard. Unlike Zapier's single all-or-nothing key,
 * an org can issue multiple scoped keys here for third-party/internal API
 * access built in later phases.
 */
export function ApiKeysCard() {
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [newKey, setNewKey] = useState<{ name: string; apiKey: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied((c) => (c === text ? null : c)), 2000);
  }

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function handleCreate() {
    setError(null);
    try {
      const result = await createKey.mutateAsync({ name, scopes: Array.from(selectedScopes) });
      setNewKey({ name: result.name, apiKey: result.apiKey });
      setCreateOpen(false);
      setName("");
      setSelectedScopes(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    await revokeKey.mutateAsync(revokeTarget.id);
    setRevokeTarget(null);
  }

  const activeKeys = (keys ?? []).filter((k) => !k.revokedAt);
  const revokedKeys = (keys ?? []).filter((k) => k.revokedAt);

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Public API Keys</p>
          <p className="text-xs text-slate-500">
            Scoped keys for direct API access — separate from the Zapier connection above.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Create Key
        </Button>
      </div>

      <div className="border-b bg-slate-50 px-6 py-3">
        <Link
          href="/settings/support/api-docs"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          View the public API + MCP docs — every endpoint, tool, scope, and request shape
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="border-b px-6 py-4">
        <p className="text-sm font-semibold text-slate-900">Connect an AI agent (MCP)</p>
        <p className="mt-1 text-xs text-slate-500">
          Any API key above also works as an MCP server connection — same key, same scopes. Point Claude (or any
          MCP client) at:
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-700">
            {mcpUrl}
          </code>
          <Button size="sm" variant="outline" onClick={() => copyToClipboard(mcpUrl)}>
            {copied === mcpUrl ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="px-6 py-5">
        {isLoading && <p className="text-sm text-slate-400">Loading…</p>}

        {!isLoading && activeKeys.length === 0 && revokedKeys.length === 0 && (
          <p className="text-sm text-slate-400">No API keys yet. Create one to get started.</p>
        )}

        {activeKeys.length > 0 && (
          <ul className="divide-y">
            {activeKeys.map((key) => (
              <li key={key.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{key.name}</p>
                  <p className="font-mono text-xs text-slate-500">{key.keyPrefix}…</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {key.scopes.length} scope{key.scopes.length === 1 ? "" : "s"} ·{" "}
                    {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        {revokedKeys.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Revoked</p>
            <ul className="divide-y">
              {revokedKeys.map((key) => (
                <li key={key.id} className="flex items-center justify-between py-2 opacity-60">
                  <div>
                    <p className="text-sm text-slate-700">{key.name}</p>
                    <p className="font-mono text-xs text-slate-500">{key.keyPrefix}…</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">Revoked</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-slate-500 hover:text-red-600"
                      disabled={deleteKey.isPending}
                      onClick={() => deleteKey.mutate(key.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Create key dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Pick only the scopes this key needs. The plaintext key is shown once, immediately after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Reporting integration"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Scopes</Label>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
                {API_SCOPE_RESOURCES.map((resource) => (
                  <div key={resource.key}>
                    <p className="text-xs font-medium text-slate-700">{resource.label}</p>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {resource.tiers.map((tier) => {
                        const scope = scopeString(resource.key, tier);
                        return (
                          <label key={scope} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Checkbox
                              checked={selectedScopes.has(scope)}
                              onCheckedChange={() => toggleScope(scope)}
                            />
                            {tierLabel(tier)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || selectedScopes.size === 0 || createKey.isPending}
              onClick={handleCreate}
            >
              {createKey.isPending ? "Creating…" : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New key reveal dialog */}
      <Dialog open={newKey !== null} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this key now — it won&apos;t be shown again. {newKey?.name}
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={newKey?.apiKey ?? ""} className="font-mono text-sm" />

          {newKey && (() => {
            const mcpConfigJson = JSON.stringify(
              {
                mcpServers: {
                  landscapt: { url: mcpUrl, headers: { Authorization: `Bearer ${newKey.apiKey}` } },
                },
              },
              null,
              2
            );
            const mcpCliCommand = `claude mcp add --transport http landscapt ${mcpUrl} --header "Authorization: Bearer ${newKey.apiKey}"`;

            return (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>For Claude Code (run in your terminal)</Label>
                  <div className="relative">
                    <pre className="whitespace-pre-wrap break-all rounded bg-slate-900 p-3 pr-16 text-xs text-slate-100">
                      {mcpCliCommand}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute right-2 top-2 bg-white"
                      onClick={() => copyToClipboard(mcpCliCommand)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Registers this key as an MCP server named &quot;landscapt&quot; for the Claude Code CLI. Paste the whole
                    line at your terminal prompt — it&apos;s one command, not a file to edit.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>For other MCP clients (config file)</Label>
                  <div className="relative">
                    <pre className="whitespace-pre-wrap break-all rounded bg-slate-900 p-3 pr-16 text-xs text-slate-100">
                      {mcpConfigJson}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute right-2 top-2 bg-white"
                      onClick={() => copyToClipboard(mcpConfigJson)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    This is a config-file snippet, not a command — paste it into your MCP client&apos;s own config file
                    (Claude Desktop, ChatGPT, Gemini, or any other MCP-compatible client; exact file location and key
                    names vary by client). Don&apos;t paste it into a terminal. Either way, this key only sees tools for
                    the scopes you just granted it.
                  </p>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &quot;{revokeTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Any application using this key will immediately lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleRevoke}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
