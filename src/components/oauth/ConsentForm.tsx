"use client";

import { useState } from "react";
import { type ApiScopeResource, scopeString, tierLabel } from "@/lib/api/scopes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * The scope-picker + Approve/Deny buttons on the OAuth consent screen
 * (src/app/oauth/authorize/page.tsx). Submits as a plain HTML form POST to
 * /api/mcp/oauth/authorize -- no client-side fetch/JS required for the
 * actual authorization step, just for the checkbox state.
 */
export function ConsentForm({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  resources,
}: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | undefined;
  resources: ApiScopeResource[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(scope: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  return (
    <form method="POST" action="/api/mcp/oauth/authorize" className="mt-4">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="code_challenge" value={codeChallenge} />
      <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
      {state !== undefined && <input type="hidden" name="state" value={state} />}

      <div className="max-h-64 space-y-3 overflow-y-auto rounded border p-3">
        {resources.map((resource) => (
          <div key={resource.key}>
            <p className="text-sm font-medium text-slate-800">{resource.label}</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {resource.tiers.map((tier) => {
                const scope = scopeString(resource.key, tier);
                return (
                  <label key={scope} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Checkbox checked={selected.has(scope)} onCheckedChange={() => toggle(scope)} />
                    {tierLabel(tier)}
                    <input type="checkbox" name="scopes" value={scope} checked={selected.has(scope)} readOnly hidden />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="submit" name="decision" value="deny" variant="outline">
          Deny
        </Button>
        <Button type="submit" name="decision" value="approve" disabled={selected.size === 0}>
          Approve
        </Button>
      </div>
      {selected.size === 0 && <p className="mt-2 text-right text-xs text-slate-400">Select at least one to approve.</p>}
    </form>
  );
}
