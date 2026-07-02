"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Step = "loading" | "invalid" | "setup" | "submitting" | "done";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /[0-9]/.test(p) },
];

export default function PortalRegisterPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalidReason, setInvalidReason] = useState("");

  useEffect(() => {
    fetch(`/api/portal/invites/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setInvalidReason(d.error);
          setStep("invalid");
        } else {
          setEmail(d.email);
          setStep("setup");
        }
      })
      .catch(() => {
        setInvalidReason("Unable to load invite.");
        setStep("invalid");
      });
  }, [token]);

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirm && confirm.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allRulesMet || !passwordsMatch) return;

    setStep("submitting");
    setError(null);

    const res = await fetch("/api/portal/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Registration failed. Please try again.");
      setStep("setup");
      return;
    }

    // Auto sign-in after registration
    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });

    setStep("done");
    setTimeout(() => router.push("/portal"), 2000);
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
          <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Invite Invalid</h2>
          <p className="text-sm text-slate-500">{invalidReason}</p>
          <a href="/portal/login" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-brand-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Account Created!</h2>
          <p className="text-sm text-slate-500">Redirecting to your portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center mb-3">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Set Up Your Account</h1>
          <p className="text-sm text-slate-500 mt-1">{email}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
              />
            </div>

            {/* Password rules */}
            {password.length > 0 && (
              <ul className="flex flex-col gap-1">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.test(password) ? "text-brand-600" : "text-slate-400"}`}>
                    <CheckCircle2 className={`h-3.5 w-3.5 ${rule.test(password) ? "text-brand-500" : "text-slate-300"}`} />
                    {rule.label}
                  </li>
                ))}
                {confirm.length > 0 && (
                  <li className={`flex items-center gap-1.5 text-xs ${passwordsMatch ? "text-brand-600" : "text-red-500"}`}>
                    <CheckCircle2 className={`h-3.5 w-3.5 ${passwordsMatch ? "text-brand-500" : "text-red-400"}`} />
                    Passwords match
                  </li>
                )}
              </ul>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!allRulesMet || !passwordsMatch || step === "submitting"}
              className="h-9 rounded-md bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand-600 transition disabled:opacity-50"
            >
              {step === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
