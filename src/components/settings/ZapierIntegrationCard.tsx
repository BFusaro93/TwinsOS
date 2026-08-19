"use client";

import { useState } from "react";
import { useIntegration } from "@/lib/hooks/use-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Zapier connection card — shared by Equipt's Settings > Integrations
 * (src/app/(dashboard)/settings/page.tsx) and Landscapt's CRM Settings >
 * Integrations (src/app/(crm)/crm/settings/page.tsx). The Zapier API key is
 * org-wide (integrations table, provider = 'zapier'), and most of what it
 * triggers/creates is CRM domain (clients, tickets, jobs, invoices,
 * estimates) — so it's shown in both settings surfaces rather than picking
 * just one, since an org admin might only ever visit one of them.
 */
export function ZapierIntegrationCard() {
  const { data: zapier, refetch } = useIntegration("zapier");
  const [newKey, setNewKey]         = useState<string | null>(null);
  const [showKey, setShowKey]       = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/zapier", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate key");
      } else {
        setNewKey(data.apiKey);
        setShowKey(true);
        refetch();
      }
    } catch (err) {
      setError(`Network error: ${err}`);
    } finally {
      setGenerating(false);
    }
  }

  const displayKey = newKey ?? zapier?.apiKey ?? null;

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-orange-500">
            <path d="M12 2 4 7v10l8 5 8-5V7l-8-5zm0 3.2 5 3.1v7.4l-5 3.1-5-3.1V8.3l5-3.1z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Zapier</p>
          <p className="text-xs text-slate-500">
            Connect Equipt/Landscapt to 9,000+ apps — trigger Zaps on new clients, tickets, and
            paid invoices, or create clients and tickets from a Zap.
          </p>
        </div>
        {zapier?.enabled && zapier.apiKey && (
          <span className="ml-auto rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
        )}
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="space-y-1.5">
          <Label htmlFor="zapier-key">API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="zapier-key"
                type={showKey ? "text" : "password"}
                value={displayKey ?? ""}
                readOnly
                placeholder="Generate a key to connect Zapier"
                className="pr-10 font-mono text-sm"
              />
              {displayKey && (
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              )}
            </div>
            <Button size="sm" disabled={generating} onClick={handleGenerate} className="shrink-0">
              {generating ? "Generating…" : zapier?.apiKey ? "Regenerate" : "Generate Key"}
            </Button>
          </div>
          {newKey && (
            <p className="text-xs text-amber-600">
              Copy this key now — paste it into the Zapier app&apos;s API Key field. Regenerating
              replaces it, so any Zaps using the old key will need to be reconnected.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!newKey && (
            <p className="text-xs text-slate-400">
              Paste this key into Zapier when connecting the Equipt/Landscapt app. Regenerating
              invalidates the previous key.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
