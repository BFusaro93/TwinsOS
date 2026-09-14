"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface OrgOption {
  orgId: string;
  companyName: string;
  accentColor: string;
  clientName: string | null;
}

export function PortalOrgPicker({ options }: { options: OrgOption[] }) {
  const router = useRouter();
  const [loadingOrgId, setLoadingOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(orgId: string) {
    setLoadingOrgId(orgId);
    setError(null);

    const res = await fetch("/api/portal/select-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });

    if (!res.ok) {
      setError("Something went wrong — please try again.");
      setLoadingOrgId(null);
      return;
    }

    router.push("/portal");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">Choose a Company</h1>
          <p className="text-sm text-slate-500 mt-1">You have portal access with more than one company.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.orgId}
              type="button"
              onClick={() => select(opt.orgId)}
              disabled={loadingOrgId !== null}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 transition disabled:opacity-60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: opt.accentColor }}
                >
                  {opt.companyName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{opt.companyName}</p>
                  {opt.clientName && (
                    <p className="text-xs text-slate-500 truncate">as {opt.clientName}</p>
                  )}
                </div>
              </div>
              {loadingOrgId === opt.orgId && <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">{error}</p>
        )}
      </div>
    </div>
  );
}
