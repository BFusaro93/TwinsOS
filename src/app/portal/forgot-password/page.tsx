"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Password reset for CLIENT PORTAL users.
 *
 * /portal/login has linked here since it was written, but the page never
 * existed — a client who forgot their password got a 404 and no other way in,
 * since the portal's only other entry is a one-time invite link.
 *
 * It posts to the same /api/auth/reset-password as the staff page (one reset
 * pipeline, one set of rate limits, the same "always report success" shape so
 * neither page can be used to test whether an address has an account). The
 * `portal` flag only changes what the email says — /reset-password works out
 * where to send someone from their own account, not from the link.
 */
export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, portal: true }),
      });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center mb-3">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1">
            We&apos;ll email you a link to set a new one
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-5 w-5 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-900">Check your email</p>
              <p className="text-xs text-slate-500">
                If an account exists for{" "}
                <span className="font-medium text-slate-700">{email}</span>, we&apos;ve sent a
                reset link. It expires in an hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
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
                Send reset link
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          <Link href="/portal/login" className="text-brand-600 hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
