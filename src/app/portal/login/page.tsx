"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    // Verify this is a portal user, not a staff user
    const portalMeta = data.user?.user_metadata?.portal;
    if (!portalMeta) {
      await supabase.auth.signOut();
      setError("No portal account found for this email.");
      setLoading(false);
      return;
    }

    router.push("/portal");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo placeholder — branding is loaded after auth */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center mb-3">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Client Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to manage your account</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                <a href="/portal/forgot-password" className="text-xs text-brand-600 hover:underline">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-9 rounded-md bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand-600 transition disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        {/* Invite code section */}
        <div className="mt-4">
          {!showInvite ? (
            <p className="text-center text-xs text-slate-500">
              First time here?{" "}
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="text-brand-600 hover:underline font-medium"
              >
                Use your invite link
              </button>
            </p>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Enter your invite link</p>
                <p className="text-xs text-slate-500 mt-0.5">Paste the link from your invitation email</p>
              </div>
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => { setInviteInput(e.target.value); setInviteError(null); }}
                placeholder="https://…/portal/register/abc123"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
              />
              {inviteError && (
                <p className="text-xs text-red-600">{inviteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteInput(""); setInviteError(null); }}
                  className="flex-1 h-8 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const raw = inviteInput.trim();
                    // Accept full URL or bare token
                    let token: string | null = null;
                    try {
                      const url = new URL(raw);
                      const parts = url.pathname.split("/");
                      const idx = parts.indexOf("register");
                      if (idx !== -1 && parts[idx + 1]) token = parts[idx + 1];
                    } catch {
                      // Not a URL — treat as bare token
                      if (/^[a-f0-9-]{32,}$/i.test(raw)) token = raw;
                    }
                    if (!token) {
                      setInviteError("Couldn't find a valid invite token. Paste the full link from your email.");
                      return;
                    }
                    router.push(`/portal/register/${token}`);
                  }}
                  className="flex-1 h-8 rounded-md bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
